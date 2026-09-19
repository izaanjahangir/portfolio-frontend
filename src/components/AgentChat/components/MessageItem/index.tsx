"use client";

import { useMemo } from "react";
import { Markdown } from "@/components/Markdown";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { markdownToPlainText } from "@/utils/text";
import { SpeakButton } from "../SpeakButton";
import styles from "./style.module.css";
import type { ChatMessage } from "@/types";

export interface MessageItemProps {
  message: ChatMessage;
}

/** One chat bubble. User text stays plain; agent answers render markdown. */
export function MessageItem({ message }: MessageItemProps) {
  const isUser = message.role === "user";
  const { isSupported, speakingId, toggle } = useTextToSpeech();

  // Markdown read aloud verbatim sounds like punctuation soup.
  const spokenText = useMemo(
    () => (isUser ? "" : markdownToPlainText(message.content)),
    [isUser, message.content],
  );

  const canSpeak = !isUser && isSupported && spokenText.length > 0;

  return (
    <div
      className={`${styles.row} ${isUser ? styles.user : styles.assistant} agent-message`}
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

      {canSpeak ? (
        <div className={styles.actions}>
          <SpeakButton
            isSpeaking={speakingId === message.id}
            onToggle={() => toggle(message.id, spokenText)}
          />
        </div>
      ) : null}
    </div>
  );
}
