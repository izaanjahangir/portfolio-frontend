"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  describeRecognitionError,
  getSpeechRecognition,
  isSpeechRecognitionSupported,
  type SpeechRecognitionLike,
} from "@/utils/speechRecognition";
import { useClientFlag } from "./useClientFlag";

export interface UseSpeechRecognitionOptions {
  /** Called with each finalised phrase. */
  onResult: (transcript: string) => void;
  lang?: string;
}

export interface UseSpeechRecognition {
  isSupported: boolean;
  isListening: boolean;
  /** Live, not-yet-final transcript. Empty when idle. */
  interim: string;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  dismissError: () => void;
}

/**
 * Push-to-talk speech recognition.
 *
 * The recognition instance is created on demand inside `start` rather than
 * during render, so nothing is constructed for visitors who never use the
 * mic — or for browsers that can't.
 */
export function useSpeechRecognition({
  onResult,
  lang = "en-US",
}: UseSpeechRecognitionOptions): UseSpeechRecognition {
  // Detected through useClientFlag so the mic button does not appear in the
  // server render and vanish on hydration.
  const isSupported = useClientFlag(isSpeechRecognitionSupported);

  const [isListening, setIsListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);

  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // Keep the latest callback reachable without re-creating `start`.
  const onResultRef = useRef(onResult);
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Never leave the mic open behind us.
  useEffect(
    () => () => {
      recognitionRef.current?.abort();
      recognitionRef.current = null;
    },
    [],
  );

  const stop = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    if (recognitionRef.current) return;

    const SpeechRecognition = getSpeechRecognition();
    if (!SpeechRecognition) {
      setError("This browser doesn't support voice input. Try Chrome, Edge or Safari.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = lang;
    // One phrase per press: simpler to reason about than an open mic, and
    // it avoids the mic staying live if the visitor wanders off.
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
    };

    recognition.onresult = (event) => {
      let draft = "";

      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const transcript = result[0]?.transcript ?? "";
        if (result.isFinal) {
          const finalText = transcript.trim();
          if (finalText) onResultRef.current(finalText);
        } else {
          draft += transcript;
        }
      }

      setInterim(draft);
    };

    recognition.onerror = (event) => {
      const message = describeRecognitionError(event.error);
      if (message) setError(message);
    };

    recognition.onend = () => {
      recognitionRef.current = null;
      setIsListening(false);
      setInterim("");
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
    } catch {
      // start() throws if called while already running.
      recognitionRef.current = null;
      setIsListening(false);
    }
  }, [lang]);

  const toggle = useCallback(() => {
    if (recognitionRef.current) stop();
    else start();
  }, [start, stop]);

  return {
    isSupported,
    isListening,
    interim,
    error,
    start,
    stop,
    toggle,
    dismissError: useCallback(() => setError(null), []),
  };
}
