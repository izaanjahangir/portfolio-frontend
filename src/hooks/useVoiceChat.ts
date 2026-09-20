"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAgentChat, type UseAgentChat, type UseAgentChatOptions } from "./useAgentChat";
import { useSpeechRecognition } from "./useSpeechRecognition";
import { useTextToSpeech } from "./useTextToSpeech";
import { isFarewell, looksLikeQuestion } from "@/utils/intent";
import { markdownToPlainText } from "@/utils/text";
import { stopSpeaking } from "@/utils/speechSynthesis";
import type { ChatMessage } from "@/types";

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
  const sendRef = useRef<(text: string) => void>(() => {});
  const speakingIdRef = useRef<string | null>(null);
  /**
   * The client's own guess that the visitor said goodbye, used only when
   * the backend sends no metadata. The reply is still spoken either way —
   * ending the loop the moment "bye" is heard would talk over the agent's
   * sign-off — and voice mode closes once it finishes.
   */
  const endAfterReplyRef = useRef(false);
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
      toPhase("thinking");
      sendRef.current(transcript);
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

  const handleAssistantMessage = useCallback(
    (message: ChatMessage) => {
      if (phaseRef.current !== "thinking") return;

      const text = markdownToPlainText(message.content);

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
      const serverVerdict = message.metadata?.end_of_conversation;
      const shouldEnd =
        serverVerdict ?? (endAfterReplyRef.current && !looksLikeQuestion(text));

      /** Where the loop goes once the agent has finished talking. */
      const afterReply = () => {
        if (shouldEnd) {
          stopRef.current();
          return;
        }
        toPhase("listening");
        recognition.start();
      };
      if (!text) {
        afterReply();
        return;
      }

      // Belt and braces: the mic should already be closed here.
      recognition.stop();
      toPhase("speaking");
      speakingIdRef.current = message.id;

      speech.speak(message.id, text, {
        // Spoken in the language the agent answered in, not the one it was
        // asked in — otherwise a German answer is read with an English voice.
        lang: message.metadata?.language,
        onEnd: () => {
          speakingIdRef.current = null;
          // Only continue if the visitor has not left voice mode meanwhile.
          if (phaseRef.current !== "speaking") return;
          afterReply();
        },
      });
    },
    [recognition, speech, toPhase],
  );

  const handleSendError = useCallback(() => {
    if (phaseRef.current === "thinking") toPhase("idle");
  }, [toPhase]);

  // --- chat ------------------------------------------------------------

  const chat = useAgentChat({
    ...options,
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
    toPhase("listening");
    recognition.start();
  }, [recognition, toPhase]);

  const stop = useCallback(() => {
    silentTurnsRef.current = 0;
    speakingIdRef.current = null;
    endAfterReplyRef.current = false;
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
