"use client";

import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { useVoiceChat } from "@/hooks/useVoiceChat";
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
  /** Offer hands-free voice mode. Default: true. */
  enableVoice?: boolean;
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
  enableVoice = true,
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
    voice,
  } = useVoiceChat({ greeting });

  // Offer prompts until the visitor has actually said something. The greeting
  // is an assistant message, so `messages.length` alone is not the test.
  const showSuggestions =
    !isRestoring &&
    !voice.isActive &&
    suggestions.length > 0 &&
    !messages.some((message) => message.role === "user");

  const showVoice = enableVoice && voice.isSupported;

  return (
    <section className={`${styles.chat} ${className ?? ""}`}>
      {showHeader ? (
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.headerActions}>
            <button
              type="button"
              className={styles.reset}
              onClick={startNewConversation}
              disabled={!messages.some((message) => message.role === "user") && !error}
            >
              New chat
            </button>
          </div>
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

      <Composer
        onSubmit={sendMessage}
        disabled={isSending}
        placeholder={placeholder}
        voice={
          showVoice
            ? {
                phase: voice.phase,
                interim: voice.interim,
                error: voice.error,
                onToggle: voice.toggle,
              }
            : undefined
        }
      />
    </section>
  );
}
