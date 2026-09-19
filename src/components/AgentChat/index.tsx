"use client";

import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { useAgentChat } from "@/hooks/useAgentChat";
import styles from "./style.module.css";

export interface AgentChatProps {
  /** First assistant message shown on a fresh conversation. */
  greeting?: string;
  /** Prompt chips offered when the transcript is empty. */
  suggestions?: string[];
  placeholder?: string;
  title?: string;
  /** Hide the header entirely when embedding in your own chrome. */
  showHeader?: boolean;
  className?: string;
}

/**
 * Drop-in chat surface for the portfolio agent.
 *
 * Owns no layout beyond filling its parent — give it a sized container.
 * All state lives in `useAgentChat`, so if you'd rather build your own
 * markup later, call that hook directly and discard this component.
 */
export function AgentChat({
  greeting,
  suggestions = [],
  placeholder,
  title = "Ask about Izaan",
  showHeader = true,
  className,
}: AgentChatProps) {
  const {
    messages,
    isSending,
    isRestoring,
    error,
    sendMessage,
    retryLast,
    startNewConversation,
    dismissError,
  } = useAgentChat({ greeting });

  // Offer prompts until the visitor has actually said something. The greeting
  // is an assistant message, so `messages.length` alone is not the test.
  const showSuggestions =
    !isRestoring &&
    suggestions.length > 0 &&
    !messages.some((message) => message.role === "user");

  return (
    <section className={`${styles.chat} ${className ?? ""}`}>
      {showHeader ? (
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <button
            type="button"
            className={styles.reset}
            onClick={startNewConversation}
            disabled={!messages.some((message) => message.role === "user") && !error}
          >
            New chat
          </button>
        </header>
      ) : null}

      {isRestoring ? (
        <div className={styles.restoring}>Restoring your conversation…</div>
      ) : (
        <MessageList messages={messages} isSending={isSending} />
      )}

      {showSuggestions ? (
        <div className={styles.suggestions}>
          {suggestions.map((suggestion) => (
            <button
              key={suggestion}
              type="button"
              className={styles.chip}
              onClick={() => sendMessage(suggestion)}
              disabled={isSending}
            >
              {suggestion}
            </button>
          ))}
        </div>
      ) : null}

      {error ? (
        <div className={styles.error} role="alert">
          <span>{error}</span>
          <span className={styles.errorActions}>
            <button type="button" onClick={retryLast}>
              Retry
            </button>
            <button type="button" onClick={dismissError}>
              Dismiss
            </button>
          </span>
        </div>
      ) : null}

      <Composer onSubmit={sendMessage} disabled={isSending} placeholder={placeholder} />
    </section>
  );
}
