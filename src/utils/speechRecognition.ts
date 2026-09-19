/**
 * Browser speech recognition (speech → text).
 *
 * The Web Speech API is not in TypeScript's DOM lib and ships prefixed in
 * most browsers, so the minimal surface we use is declared here. Chrome,
 * Edge and Safari support it; Firefox keeps it behind a flag, which is why
 * every entry point is guarded by `getSpeechRecognition()` returning null.
 *
 * Note: Chrome's implementation streams audio to Google's servers — it is
 * not on-device. Worth disclosing wherever this is used.
 */

export interface SpeechRecognitionResultLike {
  readonly isFinal: boolean;
  readonly length: number;
  readonly [index: number]: { readonly transcript: string };
}

export interface SpeechRecognitionEventLike {
  readonly resultIndex: number;
  readonly results: ArrayLike<SpeechRecognitionResultLike>;
}

export interface SpeechRecognitionErrorEventLike {
  readonly error: string;
  readonly message?: string;
}

export interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface SpeechRecognitionWindow {
  SpeechRecognition?: SpeechRecognitionConstructor;
  webkitSpeechRecognition?: SpeechRecognitionConstructor;
}

/** The constructor for this browser, or null when unsupported. */
export function getSpeechRecognition(): SpeechRecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as unknown as SpeechRecognitionWindow;
  return candidate.SpeechRecognition ?? candidate.webkitSpeechRecognition ?? null;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognition() !== null;
}

/** Turns an error code into something worth showing a visitor. */
export function describeRecognitionError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "Microphone access was blocked. Allow it in your browser settings to use voice.";
    case "no-speech":
      return "I didn't catch that — try again.";
    case "audio-capture":
      return "No microphone found.";
    case "network":
      return "Speech recognition needs a network connection.";
    case "aborted":
      return "";
    default:
      return "Speech recognition failed. You can type instead.";
  }
}
