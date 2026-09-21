import { splitIntoSpeechChunks } from "./text";
import { selectVoice } from "./voices";

/**
 * Browser speech synthesis (text → speech).
 *
 * Exposed as an external store rather than component state because
 * `window.speechSynthesis` is a single global: two components each holding
 * their own "is it speaking?" would disagree the moment one started.
 * Consumers subscribe through `useTextToSpeech`.
 *
 * Playback is a queue, so an answer can begin being spoken while the rest
 * of it is still streaming in. `speak()` is the one-shot case — a session
 * that is closed immediately.
 */

export interface SpeechState {
  /** Id of the message currently being spoken, or null. */
  speakingId: string | null;
}

const IDLE: SpeechState = { speakingId: null };

const listeners = new Set<() => void>();

// getSnapshot must be referentially stable between changes.
let snapshot: SpeechState = IDLE;

/**
 * Voices load asynchronously; this is how long we'll wait for them.
 *
 * If none turn up, this device cannot speak — a browser with no installed
 * voices accepts an utterance, reports `speaking === true`, and then never
 * fires `onend`. Detecting that up front is the only reliable guard.
 */
const VOICES_TIMEOUT_MS = 500;

/**
 * Fallback ceiling per utterance, for a voice that starts and then stalls.
 * Roughly 8x slower than natural speech, so it never truncates real audio.
 */
const MS_PER_CHARACTER = 120;
const STALL_GRACE_MS = 4000;

interface Session {
  id: string;
  /** Guards against a cancelled session resuming after `stop()`. */
  run: number;
  lang: string;
  onEnd?: () => void;
  queue: string[];
  /** No more text will be pushed. */
  closed: boolean;
  /** An utterance is in flight. */
  busy: boolean;
  /** Voices have been checked and playback may proceed. */
  ready: boolean;
  watchdog: ReturnType<typeof setTimeout> | null;
}

let generation = 0;
let session: Session | null = null;

/** Playback of pre-rendered audio, used instead of the browser's voice. */
let audioElement: HTMLAudioElement | null = null;
let audioObjectUrl: string | null = null;

function releaseAudio(): void {
  if (audioElement) {
    audioElement.pause();
    audioElement.onended = null;
    audioElement.onerror = null;
    audioElement.src = "";
    audioElement = null;
  }
  if (audioObjectUrl) {
    URL.revokeObjectURL(audioObjectUrl);
    audioObjectUrl = null;
  }
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

function clearWatchdog(active: Session): void {
  if (active.watchdog !== null) {
    clearTimeout(active.watchdog);
    active.watchdog = null;
  }
}

/** Ends a session exactly once, whether it finished or failed. */
function finish(active: Session): void {
  if (active.run !== generation) return;
  clearWatchdog(active);
  session = null;
  setState(IDLE);
  // Failure is reported as completion on purpose: callers driving a
  // conversation need to move on, not stall on a broken speaker.
  active.onEnd?.();
}

function pump(active: Session): void {
  if (active.run !== generation || !active.ready || active.busy) return;

  const next = active.queue.shift();
  if (next === undefined) {
    // Out of text: finished only if nothing more is coming.
    if (active.closed) finish(active);
    return;
  }

  active.busy = true;

  const utterance = new SpeechSynthesisUtterance(next);
  utterance.lang = active.lang;

  // Chosen explicitly: the browser's own default is routinely one of the
  // worst voices installed. Null means nothing matched the language, in
  // which case the browser's choice is still the best available.
  const voice = selectVoice(active.lang);
  if (voice) {
    utterance.voice = voice;
    // Keep the two in step, or some engines re-resolve to the default.
    utterance.lang = voice.lang;
  }

  const advance = () => {
    if (active.run !== generation) return;
    active.busy = false;
    clearWatchdog(active);
    pump(active);
  };

  utterance.onend = advance;
  utterance.onerror = () => {
    if (active.run !== generation) return;
    finish(active);
  };

  window.speechSynthesis.speak(utterance);

  clearWatchdog(active);
  active.watchdog = setTimeout(
    () => {
      if (active.run !== generation) return;
      window.speechSynthesis.cancel();
      finish(active);
    },
    next.length * MS_PER_CHARACTER + STALL_GRACE_MS,
  );
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

export function stopSpeaking(): void {
  if (typeof window === "undefined") return;

  generation += 1;
  if (session) clearWatchdog(session);
  session = null;
  releaseAudio();

  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
  if (snapshot.speakingId !== null) setState(IDLE);
}

/**
 * Plays pre-rendered audio for a message, in place of the browser's voice.
 *
 * Shares the same "who is speaking" state as synthesis, so the UI and the
 * voice loop cannot tell the two apart — which is the point: the provider
 * can change without anything downstream knowing.
 */
export function playAudioBlob(id: string, blob: Blob, options: SpeakOptions = {}): void {
  if (typeof window === "undefined") {
    options.onEnd?.();
    return;
  }

  stopSpeaking();
  const run = ++generation;

  const url = URL.createObjectURL(blob);
  const element = new Audio(url);

  audioElement = element;
  audioObjectUrl = url;
  setState({ speakingId: id });

  const done = () => {
    if (run !== generation) return;
    releaseAudio();
    setState(IDLE);
    options.onEnd?.();
  };

  element.onended = done;
  // Playback failure is reported as completion for the same reason a failed
  // utterance is: a voice loop waiting on `onEnd` must not stall.
  element.onerror = done;

  void element.play().catch(done);
}

export interface SpeakOptions {
  /** BCP-47 tag. Falls back to English when the agent didn't say. */
  lang?: string | null;
  /**
   * Called once the whole queue finishes naturally. Not called when
   * playback is cancelled or superseded — the voice loop relies on that
   * distinction to decide whether to start listening again.
   */
  onEnd?: () => void;
}

/** A session that text can be appended to while it is already playing. */
export interface SpeechStream {
  /** Queues more text. Safe to call after `close`, where it is ignored. */
  push: (text: string) => void;
  /** Updates the voice language for text queued from here on. */
  setLanguage: (lang: string | null | undefined) => void;
  /** Signals that no more text is coming; `onEnd` fires once drained. */
  close: () => void;
}

const NO_OP_STREAM: SpeechStream = {
  push: () => {},
  setLanguage: () => {},
  close: () => {},
};

/**
 * Begins speaking, with text supplied over time.
 *
 * Used to start reading an answer aloud while the rest of it is still
 * streaming from the backend, which removes the whole generation time
 * from the pause before the visitor hears anything.
 */
export function speakStream(id: string, options: SpeakOptions = {}): SpeechStream {
  if (!isSpeechSynthesisSupported()) {
    options.onEnd?.();
    return NO_OP_STREAM;
  }

  stopSpeaking();
  const run = ++generation;

  const active: Session = {
    id,
    run,
    lang: options.lang || "en-US",
    onEnd: options.onEnd,
    queue: [],
    closed: false,
    busy: false,
    ready: false,
    watchdog: null,
  };

  session = active;
  setState({ speakingId: id });

  whenVoicesReady((hasVoices) => {
    if (active.run !== generation) return;

    // Nothing can be spoken on this device. Report completion immediately
    // so a voice conversation reopens the mic instead of hanging.
    if (!hasVoices) {
      finish(active);
      return;
    }

    active.ready = true;
    pump(active);
  });

  return {
    push: (text: string) => {
      if (active.run !== generation || active.closed) return;
      const trimmed = text.trim();
      if (!trimmed) return;
      active.queue.push(...splitIntoSpeechChunks(trimmed));
      pump(active);
    },
    setLanguage: (lang) => {
      if (active.run !== generation) return;
      active.lang = lang || active.lang;
    },
    close: () => {
      if (active.run !== generation) return;
      active.closed = true;
      pump(active);
    },
  };
}

/**
 * Speaks `text`, attributing playback to `id` so the UI can show which
 * message is talking. Speaking anything stops whatever came before.
 */
export function speak(id: string, text: string, options: SpeakOptions = {}): void {
  const stream = speakStream(id, options);
  stream.push(text);
  stream.close();
}
