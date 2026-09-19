"use client";

import styles from "./style.module.css";

/** Shown while the agent composes its answer (the API is non-streaming). */
export function TypingIndicator() {
  return (
    <div className={styles.row}>
      <div className={styles.bubble} aria-label="The agent is typing">
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}
