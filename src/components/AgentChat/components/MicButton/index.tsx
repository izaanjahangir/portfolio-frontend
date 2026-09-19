"use client";

import styles from "./style.module.css";

export interface MicButtonProps {
  isListening: boolean;
  disabled?: boolean;
  onToggle: () => void;
}

/** Presentational push-to-talk button. State lives in useSpeechRecognition. */
export function MicButton({ isListening, disabled = false, onToggle }: MicButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.mic} ${isListening ? styles.listening : ""}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={isListening}
      aria-label={isListening ? "Stop listening" : "Speak your message"}
      title={isListening ? "Stop listening" : "Speak your message"}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z"
        />
        <path
          fill="currentColor"
          d="M17.3 11a.9.9 0 0 0-1.8 0 3.5 3.5 0 0 1-7 0 .9.9 0 0 0-1.8 0 5.3 5.3 0 0 0 4.4 5.2V19h-2a.9.9 0 0 0 0 1.8h5.8a.9.9 0 0 0 0-1.8h-2v-2.8a5.3 5.3 0 0 0 4.4-5.2z"
        />
      </svg>
    </button>
  );
}
