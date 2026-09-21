"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentChat, type UseAgentChat, type UseAgentChatOptions } from "./useAgentChat";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useTextToSpeech } from "./useTextToSpeech";
import { isFarewell, looksLikeQuestion } from "@/utils/intent";
import { markdownToPlainText, takeSpeakableChunk } from "@/utils/text";
import {
  playAudioStream,
  speak,
  speakStream,
  stopSpeaking,
  unlockAudioPlayback,
  type AudioStream,
  type SpeechStream,
} from "@/utils/speechSynthesis";
import type { ChatChannel, ChatMessage } from "@/types";

/**
 * Hands-free voice conversation.
 *
 * Wraps `useAgentChat` with a loop: listen → send → think → speak → listen.
 * The visitor never presses send.
 *
 * The loop is driven entirely by callbacks (speech end, reply arrival)
 * rather than by effects watching state. That is deliberate — an effect
 * watching "has a new message appeared?" reacts a render late, which is
 * long enough to reopen the mic while the agent is still talking.
 *
 * ## The rule that matters
 *
 * The mic is never open while the agent is speaking. If it were, speech
 * recognition would transcribe the agent's own voice and send it back as
 * the next question, and the conversation would talk to itself forever.
 * Every transition into `speaking` therefore stops recognition first, and
 * listening only resumes from the utterance's `onEnd`.
 */

export type VoicePhase = "idle" | "listening" | "thinking" | "speaking";

/** Consecutive silent listens before the loop gives up on its own. */
const MAX_SILENT_TURNS = 3;

export interface UseVoiceChat extends UseAgentChat {
  voice: {
    isSupported: boolean;
    phase: VoicePhase;
    isActive: boolean;
    /** Live transcript while listening. */
    interim: string;
    error: string | null;
    start: () => void;
    stop: () => void;
    toggle: () => void;
  };
}

export function useVoiceChat(options: UseAgentChatOptions = {}): UseVoiceChat {
  const [phase, setPhase] = useState<VoicePhase>("idle");

  // Callbacks fire outside React's render cycle, so they read the live
  // phase from a ref rather than a captured value.
  const phaseRef = useRef<VoicePhase>("idle");
  const silentTurnsRef = useRef(0);
  const sendRef = useRef<(text: string, channel?: ChatChannel) => void>(() => {});
  const speakingIdRef = useRef<string | null>(null);
  /**
   * The client's own guess that the visitor said goodbye, used only when
   * the backend sends no metadata. The reply is still spoken either way —
   * ending the loop the moment "bye" is heard would talk over the agent's
   * sign-off — and voice mode closes once it finishes.
   */
  const endAfterReplyRef = useRef(false);
  /** Live speech session for the reply currently arriving. */
  const streamRef = useRef<SpeechStream | null>(null);
  /** Live playback session for a reply the backend is synthesising. */
  const audioStreamRef = useRef<AudioStream | null>(null);
  /** Streamed markdown not yet released to the speaker. */
  const bufferRef = useRef("");
  /** Whether the backend will have audio for the reply currently arriving. */
  const ttsAvailableRef = useRef(false);
  // Set from effects below: these callbacks are defined before the values
  // they need exist, so they reach them through refs.
  const restartListeningRef = useRef<() => void>(() => {});
  const stopRef = useRef<() => void>(() => {});

  const speech = useTextToSpeech();

  const toPhase = useCallback((next: VoicePhase) => {
    phaseRef.current = next;
    setPhase(next);
  }, []);

  // --- listening -------------------------------------------------------

  const handleTranscript = useCallback(
    (transcript: string) => {
      if (phaseRef.current !== "listening") return;
      silentTurnsRef.current = 0;
      endAfterReplyRef.current = isFarewell(transcript);
      bufferRef.current = "";
      toPhase("thinking");
      // Spoken questions ask for spoken answers: short prose the agent
      // wrote to be heard, rather than markdown that has to be stripped.
      sendRef.current(transcript, "voice");
    },
    [toPhase],
  );

  const handleRecognitionEnd = useCallback(
    ({ hadResult }: { hadResult: boolean }) => {
      // Only silence brings us back here; a result already moved us on.
      if (phaseRef.current !== "listening" || hadResult) return;

      silentTurnsRef.current += 1;
      if (silentTurnsRef.current >= MAX_SILENT_TURNS) {
        silentTurnsRef.current = 0;
        toPhase("idle");
        return;
      }

      restartListeningRef.current();
    },
    [toPhase],
  );

  const recognition = useSpeechRecognition({
    onResult: handleTranscript,
    onEnd: handleRecognitionEnd,
    ignoreNoSpeech: true,
  });

  useEffect(() => {
    restartListeningRef.current = recognition.start;
  }, [recognition.start]);

  // --- speaking --------------------------------------------------------

  /** Hands the turn back to the visitor, or closes voice mode. */
  const afterReply = useCallback(() => {
    if (endAfterReplyRef.current) {
      stopRef.current();
      return;
    }
    toPhase("listening");
    restartListeningRef.current();
  }, [toPhase]);

  /**
   * Starts speaking before the answer exists.
   *
   * Waiting for the full reply meant the visitor heard nothing for the
   * whole generation — 10-30s on a complex question. Opening the speech
   * session here and feeding it sentence by sentence removes almost all of
   * that: the agent starts talking a beat after the first sentence lands.
   */
  const handleAssistantStart = useCallback(
    (messageId: string, ttsAvailable: boolean) => {
      if (phaseRef.current !== "thinking") return;

      ttsAvailableRef.current = ttsAvailable;
      speakingIdRef.current = messageId;
      bufferRef.current = "";

      // Hosted audio arrives as its own events, sentence by sentence, and
      // the first one may be a moment behind the first words of text.
      // Staying in "thinking" until a clip lands is the honest status, and
      // it leaves the browser voice free to take over if none ever does.
      if (ttsAvailable) return;

      toPhase("speaking");

      streamRef.current = speakStream(messageId, {
        // Opens with the default voice; the stream's `language` event
        // corrects it before any text is queued. `done` is authoritative
        // if that event never arrives.
        onEnd: () => {
          streamRef.current = null;
          speakingIdRef.current = null;
          // Only continue if the visitor has not left voice mode meanwhile.
          if (phaseRef.current !== "speaking") return;
          afterReply();
        },
      });
    },
    [afterReply, toPhase],
  );

  /**
   * Plays the reply's synthesised sentences as they arrive.
   *
   * The queue lives in `playAudioStream`: a clip that lands while the
   * previous one is still playing is appended, never interrupting it, and
   * plays from that one's `ended`. Arrival order is speaking order, so
   * nothing is ever reordered.
   */
  const handleAssistantAudio = useCallback(
    (messageId: string, clip: Blob) => {
      if (speakingIdRef.current !== messageId) return;
      if (phaseRef.current !== "thinking" && phaseRef.current !== "speaking") return;
      // `start` said there would be no hosted audio and the browser voice
      // took the reply. Cutting it off mid-sentence to switch voices is
      // worse than ignoring the clips.
      if (streamRef.current) return;

      let audio = audioStreamRef.current;

      if (!audio) {
        // The first clip. Closing the mic before a sound plays is the whole
        // rule of this loop — otherwise the agent hears itself and replies.
        recognition.stop();
        toPhase("speaking");

        audio = playAudioStream(messageId, {
          onEnd: () => {
            audioStreamRef.current = null;
            speakingIdRef.current = null;
            if (phaseRef.current !== "speaking") return;
            afterReply();
          },
        });
        audioStreamRef.current = audio;
      }

      audio.push(clip);
    },
    [afterReply, recognition, toPhase],
  );

  /**
   * Sets the voice before a word is spoken.
   *
   * The event lands between `start` and the first `delta`, so the speech
   * session exists but has nothing queued yet — every utterance therefore
   * gets the right language. Without it the opening sentences of a
   * non-English answer were read in an English voice.
   */
  const handleAssistantLanguage = useCallback((messageId: string, language: string) => {
    if (speakingIdRef.current !== messageId) return;
    streamRef.current?.setLanguage(language);
  }, []);

  /** Releases complete sentences to the speaker as they arrive. */
  const handleAssistantDelta = useCallback((messageId: string, chunk: string) => {
    const stream = streamRef.current;
    if (!stream || speakingIdRef.current !== messageId) return;

    bufferRef.current += chunk;
    const { ready, rest } = takeSpeakableChunk(bufferRef.current);
    bufferRef.current = rest;

    if (ready.trim()) stream.push(markdownToPlainText(ready));
  }, []);

  const handleAssistantMessage = useCallback(
    (message: ChatMessage) => {
      const stream = streamRef.current;

      /**
       * The agent decides whether the conversation is over; the keyword
       * guess only fills in when it said nothing.
       *
       * `false` is authoritative and deliberately not overridden — the
       * agent may have just asked a question it needs answered, which a
       * keyword match cannot know. Only a missing (or null) metadata
       * object falls back, and even then a reply that ends in a question
       * keeps the mic open: the backend has been seen to omit metadata
       * intermittently, and hanging up on "what's your email?" is the
       * worst outcome available.
       */
      const spoken = markdownToPlainText(message.content);
      const serverVerdict = message.metadata?.end_of_conversation;
      endAfterReplyRef.current =
        serverVerdict ?? (endAfterReplyRef.current && !looksLikeQuestion(spoken));

      // Hosted audio: the clips already queued keep playing, and `close`
      // only marks the end of the queue — `done` arriving first never cuts
      // playback short. Its `onEnd` decides what happens next.
      if (audioStreamRef.current && speakingIdRef.current === message.id) {
        audioStreamRef.current.close();
        return;
      }

      // The common path: a session is already speaking this reply, so just
      // flush the tail and let its `onEnd` decide what happens next.
      if (stream && speakingIdRef.current === message.id) {
        stream.setLanguage(message.metadata?.language);
        const tail = bufferRef.current;
        bufferRef.current = "";
        if (tail.trim()) stream.push(markdownToPlainText(tail));
        stream.close();
        return;
      }

      // No live session. Either the reply arrived without a `start` event,
      // voice mode was entered mid-flight, or audio was promised and never
      // came — synthesis is best effort and a budget can run out partway
      // through an answer. Speak the whole thing with the browser's voice.
      //
      // Deliberately not GET /messages/{id}/audio: the clips for a live
      // reply come down the stream now, and fetching would either duplicate
      // them or pay to synthesise what the backend already declined to.
      if (phaseRef.current !== "thinking") return;

      if (!spoken) {
        afterReply();
        return;
      }

      recognition.stop();
      toPhase("speaking");
      speakingIdRef.current = message.id;

      speak(message.id, spoken, {
        lang: message.metadata?.language,
        onEnd: () => {
          speakingIdRef.current = null;
          if (phaseRef.current !== "speaking") return;
          afterReply();
        },
      });
    },
    [afterReply, recognition, toPhase],
  );

  const handleSendError = useCallback(() => {
    // Now that speech begins before the answer is complete, a failure can
    // land mid-sentence. Tearing the whole loop down covers both cases and
    // guarantees the live speech session can't be left open with nothing
    // to drain it, which would hang the loop in `speaking` forever.
    if (phaseRef.current === "idle") return;
    stopRef.current();
  }, []);

  // --- chat ------------------------------------------------------------

  const chat = useAgentChat({
    ...options,
    onAssistantStart: handleAssistantStart,
    onAssistantDelta: handleAssistantDelta,
    onAssistantAudio: handleAssistantAudio,
    onAssistantLanguage: handleAssistantLanguage,
    onAssistantMessage: handleAssistantMessage,
    onSendError: handleSendError,
  });

  useEffect(() => {
    sendRef.current = chat.sendMessage;
  }, [chat.sendMessage]);


  // --- controls --------------------------------------------------------

  const start = useCallback(() => {
    if (phaseRef.current !== "idle") return;
    silentTurnsRef.current = 0;
    endAfterReplyRef.current = false;
    bufferRef.current = "";
    // Buys the right to play the reply's audio, while the click that got
    // us here still counts as the visitor asking for sound.
    unlockAudioPlayback();
    toPhase("listening");
    recognition.start();
  }, [recognition, toPhase]);

  const stop = useCallback(() => {
    silentTurnsRef.current = 0;
    speakingIdRef.current = null;
    endAfterReplyRef.current = false;
    streamRef.current = null;
    audioStreamRef.current = null;
    bufferRef.current = "";
    ttsAvailableRef.current = false;
    toPhase("idle");
    recognition.stop();
    speech.stop();
  }, [recognition, speech, toPhase]);

  useEffect(() => {
    stopRef.current = stop;
  }, [stop]);

  const toggle = useCallback(() => {
    if (phaseRef.current === "idle") start();
    else stop();
  }, [start, stop]);

  // Leaving the chat must not leave the mic live or the speaker talking.
  // Deliberately depends on nothing and calls the module-level stop: a
  // dependency that changes identity each render would re-run this cleanup
  // on every render, cancelling speech mid-sentence.
  useEffect(
    () => () => {
      phaseRef.current = "idle";
      stopSpeaking();
    },
    [],
  );

  return {
    ...chat,
    voice: {
      isSupported: recognition.isSupported && speech.isSupported,
      phase,
      isActive: phase !== "idle",
      interim: recognition.interim,
      error: recognition.error,
      start,
      stop,
      toggle,
    },
  };
}
