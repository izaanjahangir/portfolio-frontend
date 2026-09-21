import { getMessageAudio } from "@/apiService/messages";
import {
  TTS_PROVIDER,
  TTS_PROVIDER_OVERRIDE_KEY,
  type TtsProvider,
} from "@/config/constants";
import { playAudioBlob, speak, type SpeakOptions } from "./speechSynthesis";

/**
 * Chooses how a message is spoken.
 *
 * Everything downstream — the voice loop, the speak buttons, the UI state —
 * is unaware of which provider ran. Switching is a config change, not a
 * code change.
 */

/**
 * The provider in effect.
 *
 * `NEXT_PUBLIC_TTS_PROVIDER` sets the default but is inlined at build time,
 * so a localStorage override exists for flipping it mid-session without
 * restarting the dev server:
 *
 *     localStorage.setItem("portfolio.agent.ttsProvider", "browser")
 *
 * That matters in practice — the paid tier is metered, and testing an
 * unrelated change shouldn't quietly spend it.
 */
export function resolveTtsProvider(): TtsProvider {
  if (typeof window !== "undefined") {
    try {
      const override = window.localStorage.getItem(TTS_PROVIDER_OVERRIDE_KEY);
      if (override === "browser" || override === "elevenlabs") return override;
    } catch {
      // Storage unavailable; fall through to the build-time default.
    }
  }
  return TTS_PROVIDER;
}

/**
 * Speaks a message, using pre-rendered audio when configured and available.
 *
 * `text` is the plain-text fallback, used whenever the audio endpoint says
 * no — quota exhausted, message not eligible, endpoint not deployed yet.
 * Falling back to the browser's voice always beats saying nothing.
 */
export function speakMessage(id: string, text: string, options: SpeakOptions = {}): void {
  if (resolveTtsProvider() === "browser") {
    speak(id, text, options);
    return;
  }

  void getMessageAudio(id)
    .then((blob) => {
      if (blob) playAudioBlob(id, blob, options);
      else speak(id, text, options);
    })
    .catch(() => speak(id, text, options));
}
