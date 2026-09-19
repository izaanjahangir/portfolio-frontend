"use client";

import type { VoicePhase } from "@/hooks/useVoiceChat";
import styles from "./style.module.css";

export interface MicButtonProps {
  phase: VoicePhase;
  disabled?: boolean;
  onToggle: () => void;
}

const LABELS: Record<VoicePhase, string> = {
  idle: "Start talking",
  listening: "Listening — tap to stop",
  thinking: "Thinking — tap to stop",
  speaking: "Speaking — tap to stop",
};

/**
 * Enters and leaves hands-free voice mode. Purely presentational: the
 * conversation loop lives in useVoiceChat.
 */
export function MicButton({ phase, disabled = false, onToggle }: MicButtonProps) {
  const label = LABELS[phase];

  return (
    <button
      type="button"
      className={`${styles.mic} ${styles[phase]}`}
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={phase !== "idle"}
      aria-label={label}
      title={label}
    >
      {phase === "idle" ? (
        <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
          <path fill="currentColor" d="M12 14a3 3 0 0 0 3-3V5a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3z" />
          <path
            fill="currentColor"
            d="M17.3 11a.9.9 0 0 0-1.8 0 3.5 3.5 0 0 1-7 0 .9.9 0 0 0-1.8 0 5.3 5.3 0 0 0 4.4 5.2V19h-2a.9.9 0 0 0 0 1.8h5.8a.9.9 0 0 0 0-1.8h-2v-2.8a5.3 5.3 0 0 0 4.4-5.2z"
          />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
        </svg>
      )}
    </button>
  );
}
