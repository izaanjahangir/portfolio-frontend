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

/**
 * Playback of pre-rendered audio, used instead of the browser's voice.
 *
 * The backend speaks a reply as **one continuous recording** and sends it
 * as consecutive byte ranges of that single MP3 while the provider is still
 * producing it. So these are not clips to queue and play one after another
 * — chunk 0 alone is a fragment, not a file. They are appended into one
 * buffer, which is why the result has no seams in it.
 *
 * Two ways to do that, chosen per browser:
 *
 * - `MediaSource`, which plays the recording while it is still arriving.
 * - Collecting the chunks and playing the finished file, for browsers
 *   without Media Source Extensions for MP3 — Safari, notably. Since the
 *   chunks are consecutive ranges of one file, concatenating them
 *   reconstructs it byte for byte. The cost is waiting for the last chunk.
 */
interface AudioSession {
  id: string;
  /** Guards against a cancelled session resuming after `stop()`. */
  run: number;
  onEnd?: () => void;
  /** No more chunks are coming — the `final` one arrived, or the stream ended. */
  closed: boolean;
  /** Object URL backing the element, held so it can be revoked. */
  url: string | null;
  /** Streaming path. Null when this browser buffers instead. */
  media: MediaSource | null;
  buffer: SourceBuffer | null;
  /** Chunks waiting to be appended: `appendBuffer` takes one at a time. */
  pending: Uint8Array[];
  /** Buffering path: every chunk, concatenated once the last one lands. */
  collected: Uint8Array[] | null;
  /** Playback has been asked for, so it is not asked for twice. */
  started: boolean;
}

let audioSession: AudioSession | null = null;

/**
 * One element for every clip, rather than one per clip.
 *
 * Safari grants playback permission to the element the visitor's gesture
 * touched, not to the document, so a fresh `new Audio()` per sentence
 * would be blocked from the second clip on.
 */
let audioElement: HTMLAudioElement | null = null;
let audioUnlocked = false;

/** 10ms of silence — long enough to count as playback, short enough to not be heard. */
const SILENT_CLIP =
  "data:audio/wav;base64,UklGRnQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVAAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==";

function getAudioElement(): HTMLAudioElement {
  audioElement ??= new Audio();
  return audioElement;
}

/**
 * Buys permission to play audio later, from inside a user gesture.
 *
 * Browsers only allow playback a visitor asked for, and by the time the
 * first clip arrives the click that started voice mode is long past. So
 * the element plays silence now, while the gesture is still live, and
 * every clip after that rides on the permission this earns.
 */
export function unlockAudioPlayback(): void {
  if (typeof window === "undefined" || audioUnlocked) return;
  audioUnlocked = true;

  const element = getAudioElement();
  element.src = SILENT_CLIP;
  void element.play().catch(() => {});
}

/** The streamed MP3 format this browser can append while it plays. */
const STREAM_MIME = "audio/mpeg";

/**
 * Whether the recording can be played while it is still arriving.
 *
 * False on Safari, which ships Media Source Extensions but supports only
 * MP4/AAC through them, and on iPhone, where `MediaSource` is absent
 * entirely. Those browsers take the buffering path instead.
 */
export function canStreamAudio(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.MediaSource !== "undefined" &&
    window.MediaSource.isTypeSupported(STREAM_MIME)
  );
}

function releaseAudio(): void {
  const active = audioSession;

  // Before the element is reset, not after: detaching it closes the media
  // source, and `abort` on a closed source throws instead of cancelling
  // the append still in flight.
  if (active?.buffer && active.media?.readyState === "open") {
    try {
      active.buffer.abort();
    } catch {
      // Already detached. Nothing to abort.
    }
  }

  if (audioElement) {
    audioElement.pause();
    audioElement.onended = null;
    audioElement.onerror = null;
    // Assigning "" would resolve against the page URL and try to load it.
    audioElement.removeAttribute("src");
    audioElement.load();
  }

  if (active?.url) {
    URL.revokeObjectURL(active.url);
    active.url = null;
  }
}

function finishAudio(active: AudioSession): void {
  if (active.run !== generation) return;
  releaseAudio();
  audioSession = null;
  setState(IDLE);
  active.onEnd?.();
}

/** Plays whatever the element now points at, reporting failure as completion. */
function playElement(active: AudioSession, url: string): void {
  const element = getAudioElement();
  active.url = url;

  const done = () => {
    if (active.run !== generation) return;
    finishAudio(active);
  };

  element.onended = done;
  // Playback failure is reported as completion for the same reason a failed
  // utterance is: a voice loop waiting on `onEnd` must not stall.
  element.onerror = done;

  element.src = url;
  void element.play().catch(done);
}

/**
 * Appends one chunk at a time, because `appendBuffer` is asynchronous and
 * throws if called while the previous append is still running.
 */
function pumpAudio(active: AudioSession): void {
  const { buffer, media } = active;
  if (active.run !== generation || !buffer || !media) return;
  if (buffer.updating) return;

  const next = active.pending.shift();

  if (next !== undefined) {
    try {
      buffer.appendBuffer(next as BufferSource);
    } catch {
      // Out of buffer space or a malformed range: play what has landed.
      active.pending.length = 0;
      active.closed = true;
    }

    if (!active.started) {
      active.started = true;
      void getAudioElement().play().catch(() => {});
    }
    return;
  }

  // Everything appended. Closing the stream is what lets the element fire
  // `ended`, which is how the voice loop learns the reply is over.
  if (active.closed && media.readyState === "open") {
    try {
      media.endOfStream();
    } catch {
      // Already ended.
    }
  }
}

/** Starts the streaming path: the recording plays while it still arrives. */
function openMediaSource(active: AudioSession): void {
  const media = new MediaSource();
  active.media = media;

  const url = URL.createObjectURL(media);
  active.url = url;

  const element = getAudioElement();

  const done = () => {
    if (active.run !== generation) return;
    finishAudio(active);
  };

  element.onended = done;
  element.onerror = done;
  element.src = url;

  media.addEventListener(
    "sourceopen",
    () => {
      if (active.run !== generation) return;
      try {
        active.buffer = media.addSourceBuffer(STREAM_MIME);
      } catch {
        // Support was advertised and then refused. Nothing can play.
        done();
        return;
      }
      active.buffer.addEventListener("updateend", () => pumpAudio(active));
      pumpAudio(active);
    },
    { once: true },
  );
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
  // Drops any clips still queued, so a late arrival cannot start playing
  // after the visitor has moved on.
  releaseAudio();
  audioSession = null;

  if (isSpeechSynthesisSupported()) window.speechSynthesis.cancel();
  if (snapshot.speakingId !== null) setState(IDLE);
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

/** A recording that arrives in consecutive chunks while it plays. */
export interface AudioStream {
  /** Appends the next chunk. Ignored after `close`. */
  push: (chunk: Uint8Array) => void;
  /** Signals that the last chunk has arrived. Safe to call more than once. */
  close: () => void;
}

const NO_OP_AUDIO_STREAM: AudioStream = {
  push: () => {},
  close: () => {},
};

/**
 * Plays pre-rendered audio for a message, in place of the browser's voice,
 * with the recording supplied in consecutive chunks.
 *
 * Shares the same "who is speaking" state as synthesis, so the UI and the
 * voice loop cannot tell the two apart — which is the point: the provider
 * can change without anything downstream knowing.
 */
export function playAudioStream(id: string, options: SpeakOptions = {}): AudioStream {
  if (typeof window === "undefined") {
    options.onEnd?.();
    return NO_OP_AUDIO_STREAM;
  }

  stopSpeaking();
  const run = ++generation;

  const streaming = canStreamAudio();

  const active: AudioSession = {
    id,
    run,
    onEnd: options.onEnd,
    closed: false,
    url: null,
    media: null,
    buffer: null,
    pending: [],
    collected: streaming ? null : [],
    started: false,
  };

  audioSession = active;
  setState({ speakingId: id });

  if (streaming) openMediaSource(active);

  return {
    push: (chunk: Uint8Array) => {
      if (active.run !== generation || active.closed) return;
      if (active.collected) {
        active.collected.push(chunk);
        return;
      }
      active.pending.push(chunk);
      pumpAudio(active);
    },
    close: () => {
      if (active.run !== generation || active.closed) return;
      active.closed = true;

      if (!active.collected) {
        pumpAudio(active);
        return;
      }

      // Consecutive ranges of one file, so concatenating them is that file.
      const blob = new Blob(active.collected as BlobPart[], { type: STREAM_MIME });
      active.collected = null;
      playElement(active, URL.createObjectURL(blob));
    },
  };
}

/** Plays one complete recording, as served for an older message. */
export function playAudioBlob(id: string, blob: Blob, options: SpeakOptions = {}): void {
  if (typeof window === "undefined") {
    options.onEnd?.();
    return;
  }

  stopSpeaking();
  const run = ++generation;

  const active: AudioSession = {
    id,
    run,
    onEnd: options.onEnd,
    closed: true,
    url: null,
    media: null,
    buffer: null,
    pending: [],
    collected: null,
    started: true,
  };

  audioSession = active;
  setState({ speakingId: id });
  playElement(active, URL.createObjectURL(blob));
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
