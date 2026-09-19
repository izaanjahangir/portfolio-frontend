"use client";

import type { VoicePhase } from "@/hooks/useVoiceChat";
import styles from "./style.module.css";

export interface VoiceStatusProps {
  phase: VoicePhase;
  /** Live transcript while listening. */
  interim: string;
}

const LABELS: Record<Exclude<VoicePhase, "idle">, string> = {
  listening: "Listening…",
  thinking: "Thinking…",
  speaking: "Speaking…",
};

/** Tells the visitor whose turn it is. Voice has no other affordance. */
export function VoiceStatus({ phase, interim }: VoiceStatusProps) {
  if (phase === "idle") return null;

  return (
    <p className={styles.status} aria-live="polite">
      <span className={`${styles.dot} ${styles[phase]}`} aria-hidden="true" />
      <span className={styles.text}>
        {phase === "listening" && interim ? interim : LABELS[phase]}
      </span>
    </p>
  );
}
