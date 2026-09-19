"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Composer } from "./components/Composer";
import { MessageList } from "./components/MessageList";
import { useAgentChat } from "@/hooks/useAgentChat";
import { useTextToSpeech } from "@/hooks/useTextToSpeech";
import { markdownToPlainText } from "@/utils/text";
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
  /** Offer the "read replies aloud" toggle. Default: true. */
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
  } = useAgentChat({ greeting });

  // Offer prompts until the visitor has actually said something. The greeting
  // is an assistant message, so `messages.length` alone is not the test.
  const showSuggestions =
    !isRestoring &&
    suggestions.length > 0 &&
    !messages.some((message) => message.role === "user");

  const speech = useTextToSpeech();
  const [autoSpeak, setAutoSpeak] = useState(false);

  const lastAssistantMessage = useMemo(
    () => [...messages].reverse().find((message) => message.role === "assistant"),
    [messages],
  );

  // Tracks what has already been spoken. Seeded on the first run so that
  // restored history and the greeting are never read aloud on load —
  // browsers block audio without a user gesture anyway.
  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    const message = lastAssistantMessage;
    if (!message) return;

    const isFirstRun = lastSpokenIdRef.current === null;
    const alreadySpoken = lastSpokenIdRef.current === message.id;
    lastSpokenIdRef.current = message.id;

    if (isFirstRun || alreadySpoken || !autoSpeak) return;

    const text = markdownToPlainText(message.content);
    if (text) speech.speak(message.id, text);
  }, [lastAssistantMessage, autoSpeak, speech]);

  const toggleAutoSpeak = useCallback(() => {
    setAutoSpeak((current) => {
      // Turning it off should silence whatever is mid-sentence.
      if (current) speech.stop();
      return !current;
    });
  }, [speech]);

  const showVoiceToggle = enableVoice && speech.isSupported;

  return (
    <section className={`${styles.chat} ${className ?? ""}`}>
      {showHeader ? (
        <header className={styles.header}>
          <h2 className={styles.title}>{title}</h2>
          <div className={styles.headerActions}>
            {showVoiceToggle ? (
              <button
                type="button"
                className={`${styles.toggle} ${autoSpeak ? styles.toggleOn : ""}`}
                onClick={toggleAutoSpeak}
                aria-pressed={autoSpeak}
                title={autoSpeak ? "Stop reading replies aloud" : "Read replies aloud"}
              >
                {autoSpeak ? "Voice on" : "Voice off"}
              </button>
            ) : null}

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

      <Composer onSubmit={sendMessage} disabled={isSending} placeholder={placeholder} />
    </section>
  );
}
