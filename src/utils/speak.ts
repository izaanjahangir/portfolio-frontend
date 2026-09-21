import { getMessageAudio } from "@/apiService/messages";
import { playAudioBlob, speak, type SpeakOptions } from "./speechSynthesis";

export interface SpeakMessageOptions extends SpeakOptions {
  /**
   * The backend's verdict for this message. It owns the decision entirely —
   * there is no client-side provider setting to reconcile it with, which is
   * why flipping TTS off in the backend takes effect immediately with no
   * redeploy.
   */
  ttsAvailable?: boolean;
}

/**
 * Speaks a message, using hosted audio when the backend says it exists.
 *
 * `text` is the spoken fallback. It is used whenever the audio request does
 * not produce a file — exhausted quota, an ineligible message, a provider
 * hiccup. That is error handling rather than a second opinion: the backend
 * still decides whether to try at all, but a failed request must never
 * leave a voice conversation silent.
 */
export function speakMessage(
  id: string,
  text: string,
  { ttsAvailable = false, ...options }: SpeakMessageOptions = {},
): void {
  if (!ttsAvailable) {
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
