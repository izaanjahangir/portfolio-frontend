"use client";

import { useEffect, useRef } from "react";
import { MessageItem } from "../MessageItem";
import { TypingIndicator } from "../TypingIndicator";
import styles from "./style.module.css";
import type { ChatMessage } from "@/types";

export interface MessageListProps {
  messages: ChatMessage[];
  isSending: boolean;
  emptyState?: React.ReactNode;
}

/** Scrollable transcript that keeps itself pinned to the newest message. */
export function MessageList({ messages, isSending, emptyState }: MessageListProps) {
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages, isSending]);

  const isEmpty = messages.length === 0;

  return (
    <div className={styles.list} role="log" aria-live="polite" aria-relevant="additions">
      {isEmpty && emptyState ? <div className={styles.empty}>{emptyState}</div> : null}

      {messages.map((message) => (
        <MessageItem key={message.id} message={message} />
      ))}

      {isSending ? <TypingIndicator /> : null}

      <div ref={endRef} />
    </div>
  );
}
