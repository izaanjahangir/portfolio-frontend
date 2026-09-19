"use client";

import styles from "./style.module.css";

export interface SpeakButtonProps {
  isSpeaking: boolean;
  onToggle: () => void;
}

/** Plays one message aloud. Shown on assistant messages only. */
export function SpeakButton({ isSpeaking, onToggle }: SpeakButtonProps) {
  return (
    <button
      type="button"
      className={`${styles.speak} ${isSpeaking ? styles.active : ""}`}
      onClick={onToggle}
      aria-pressed={isSpeaking}
      aria-label={isSpeaking ? "Stop reading this message" : "Read this message aloud"}
      title={isSpeaking ? "Stop" : "Read aloud"}
    >
      {isSpeaking ? (
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
          <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true">
          <path fill="currentColor" d="M4 9v6h4l5 4V5L8 9H4z" />
          <path
            fill="currentColor"
            d="M16.5 8.5a.9.9 0 0 0-1.3 1.2 3.2 3.2 0 0 1 0 4.6.9.9 0 1 0 1.3 1.2 5 5 0 0 0 0-7z"
          />
        </svg>
      )}
    </button>
  );
}
