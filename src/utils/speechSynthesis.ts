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

/**
 * Voices load asynchronously; this is how long we'll wait for them.
 *
 * If none turn up, this device cannot speak — a browser with no installed
 * voices accepts an utterance, reports `speaking === true`, and then never
 * fires `onend`. Detecting that up front is the only reliable guard,
 * because once queued the API looks indistinguishable from working.
 */
const VOICES_TIMEOUT_MS = 500;

/**
 * Fallback ceiling per utterance, for a voice that starts and then stalls.
 * Roughly 8x slower than natural speech, so it never truncates real audio.
 */
const MS_PER_CHARACTER = 120;
const STALL_GRACE_MS = 4000;

function stallTimeoutFor(text: string): number {
  return text.length * MS_PER_CHARACTER + STALL_GRACE_MS;
}

let watchdog: ReturnType<typeof setTimeout> | null = null;

function clearWatchdog(): void {
  if (watchdog !== null) {
    clearTimeout(watchdog);
    watchdog = null;
  }
}

/**
 * Runs `callback` once the voice list is populated, reporting whether any
 * voice is actually available.
 */
function whenVoicesReady(callback: (hasVoices: boolean) => void): void {
  const synth = window.speechSynthesis;
  if (synth.getVoices().length > 0) {
    callback(true);
    return;
  }

  let settled = false;
  const settle = () => {
    if (settled) return;
    settled = true;
    synth.onvoiceschanged = null;
    callback(synth.getVoices().length > 0);
  };

  synth.onvoiceschanged = settle;
  setTimeout(settle, VOICES_TIMEOUT_MS);
}

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
  clearWatchdog();
  window.speechSynthesis.cancel();
  if (snapshot.speakingId !== null) setState(IDLE);
}

export interface SpeakOptions {
  lang?: string;
  /**
   * Called once the whole queue finishes naturally. Not called when
   * playback is cancelled or superseded — the voice loop relies on that
   * distinction to decide whether to start listening again.
   */
  onEnd?: () => void;
}

/**
 * Speaks `text`, attributing playback to `id` so the UI can show which
 * message is talking. Speaking anything stops whatever came before.
 */
export function speak(id: string, text: string, options: SpeakOptions = {}): void {
  const { lang = "en-US", onEnd } = options;

  if (!isSpeechSynthesisSupported()) {
    onEnd?.();
    return;
  }

  const chunks = splitIntoSpeechChunks(text);
  if (chunks.length === 0) {
    onEnd?.();
    return;
  }

  stopSpeaking();
  const run = ++generation;

  setState({ speakingId: id });

  let index = 0;

  /** Ends the queue exactly once, whether it finished or failed. */
  const finish = () => {
    if (run !== generation) return;
    clearWatchdog();
    setState(IDLE);
    // Failure is reported as completion on purpose: callers driving a
    // conversation need to move on, not stall on a broken speaker.
    onEnd?.();
  };

  const speakNext = () => {
    // A newer call (or stop) superseded this queue.
    if (run !== generation) return;

    if (index >= chunks.length) {
      finish();
      return;
    }

    const chunk = chunks[index];
    index += 1;

    const utterance = new SpeechSynthesisUtterance(chunk);
    utterance.lang = lang;

    utterance.onend = () => {
      clearWatchdog();
      speakNext();
    };
    utterance.onerror = finish;

    window.speechSynthesis.speak(utterance);

    clearWatchdog();
    watchdog = setTimeout(() => {
      if (run !== generation) return;
      window.speechSynthesis.cancel();
      finish();
    }, stallTimeoutFor(chunk));
  };

  whenVoicesReady((hasVoices) => {
    if (run !== generation) return;

    // Nothing can be spoken on this device. Report completion immediately
    // so a voice conversation reopens the mic instead of hanging.
    if (!hasVoices) {
      finish();
      return;
    }

    speakNext();
  });
}
