"use client";

import { Markdown } from "@/components/Markdown";
import styles from "./style.module.css";
import type { ChatMessage } from "@/types";

export interface MessageItemProps {
  message: ChatMessage;
}

/** One chat bubble. User text stays plain; agent answers render markdown. */
export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";

  return (
    <div
      className={`${styles.row} ${isUser ? styles.user : styles.assistant}`}
      data-role={message.role}
    >
      <div
        className={`${styles.bubble} ${message.pending ? styles.pending : ""} ${
          message.error ? styles.failed : ""
        }`}
      >
        {isUser ? (
          <p className={styles.plain}>{message.content}</p>
        ) : (
          <Markdown>{message.content}</Markdown>
        )}
      </div>
    </div>
  );
}
