import { splitIntoSpeechChunks } from "./text";

/**
 * Browser speech synthesis (text → speech).
 *
 * Exposed as an external store rather than component state because
 * `window.speechSynthesis` is a single global: two components each holding
 * their own copy of "is it speaking?" would disagree the moment one of them
 * started playback. Consumers subscribe through `useTextToSpeech`.
 *
 * Long text is spoken as a queue of short utterances — Chrome silently cuts
 * a single utterance off after roughly 15 seconds.
 */

export interface SpeechState {
  /** Id of the message currently being spoken, or null. */
  speakingId: string | null;
}

const IDLE: SpeechState = { speakingId: null };

const listeners = new Set<() => void>();

// getSnapshot must be referentially stable between changes.
let snapshot: SpeechState = IDLE;

/** Guards against a cancelled queue resuming after `stop()`. */
let generation = 0;

function setState(next: SpeechState): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

export function subscribeToSpeech(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSpeechSnapshot(): SpeechState {
  return snapshot;
}

export function getSpeechServerSnapshot(): SpeechState {
  return IDLE;
}

export function isSpeechSynthesisSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking(): void {
  if (!isSpeechSynthesisSupported()) return;
  generation += 1;
  window.speechSynthesis.cancel();
  if (snapshot.speakingId !== null) setState(IDLE);
}

/**
 * Speaks `text`, attributing playback to `id` so the UI can show which
 * message is talking. Speaking anything stops whatever came before.
 */
export function speak(id: string, text: string, lang = "en-US"): void {
  if (!isSpeechSynthesisSupported()) return;

  const chunks = splitIntoSpeechChunks(text);
  if (chunks.length === 0) return;

  stopSpeaking();
  const run = ++generation;

  setState({ speakingId: id });

  let index = 0;

  const speakNext = () => {
    // A newer call (or stop) superseded this queue.
    if (run !== generation) return;

    if (index >= chunks.length) {
      setState(IDLE);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(chunks[index]);
    utterance.lang = lang;
    index += 1;

    utterance.onend = speakNext;
    utterance.onerror = () => {
      if (run !== generation) return;
      setState(IDLE);
    };

    window.speechSynthesis.speak(utterance);
  };

  speakNext();
}
