"use client";

import { useCallback, useMemo, useSyncExternalStore } from "react";
import {
  getSpeechServerSnapshot,
  getSpeechSnapshot,
  isSpeechSynthesisSupported,
  speak,
  stopSpeaking,
  subscribeToSpeech,
  type SpeakOptions,
} from "@/utils/speechSynthesis";
import { speakMessage } from "@/utils/speak";
import { useClientFlag } from "./useClientFlag";

export interface UseTextToSpeech {
  isSupported: boolean;
  /** Id of the message currently being spoken, or null. */
  speakingId: string | null;
  isSpeaking: boolean;
  /** Speaks `text`; speaking the message that is already playing stops it. */
  toggle: (id: string, text: string, ttsAvailable?: boolean) => void;
  speak: (id: string, text: string, options?: SpeakOptions) => void;
  stop: () => void;
}

/**
 * Reads playback state from the shared speech store, so every component
 * showing a speak button agrees on which message is talking.
 */
export function useTextToSpeech(): UseTextToSpeech {
  // See useClientFlag: feature detection must not differ between the server
  // render and hydration.
  const isSupported = useClientFlag(isSpeechSynthesisSupported);

  const { speakingId } = useSyncExternalStore(
    subscribeToSpeech,
    getSpeechSnapshot,
    getSpeechServerSnapshot,
  );

  const toggle = useCallback(
    (id: string, text: string, ttsAvailable?: boolean) => {
      if (speakingId === id) stopSpeaking();
      else speakMessage(id, text, { ttsAvailable });
    },
    [speakingId],
  );

  // Memoised: callers put this object in effect dependency arrays, and a
  // fresh identity each render would re-run those effects continuously.
  return useMemo(
    () => ({
      isSupported,
      speakingId,
      isSpeaking: speakingId !== null,
      toggle,
      speak,
      stop: stopSpeaking,
    }),
    [isSupported, speakingId, toggle],
  );
}
