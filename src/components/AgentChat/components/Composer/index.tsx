"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { MAX_MESSAGE_LENGTH } from "@/config/constants";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { MicButton } from "../MicButton";
import styles from "./style.module.css";

export interface ComposerProps {
  onSubmit: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
  /** Max rows before the textarea starts scrolling. */
  maxRows?: number;
}

/** Auto-growing input. Enter sends, Shift+Enter inserts a newline. */
export function Composer({
  onSubmit,
  disabled = false,
  placeholder = "Ask me anything…",
  maxRows = 6,
}: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Dictation appends to whatever is already typed rather than replacing it,
  // so voice and keyboard can be mixed in one message.
  const appendTranscript = useCallback((transcript: string) => {
    setValue((current) => {
      const next = current ? `${current.trimEnd()} ${transcript}` : transcript;
      return next.slice(0, MAX_MESSAGE_LENGTH);
    });
  }, []);

  const speech = useSpeechRecognition({ onResult: appendTranscript });

  // Resize to fit content, capped at `maxRows`.
  useLayoutEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    textarea.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(textarea).lineHeight) || 20;
    const maxHeight = lineHeight * maxRows;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, maxRows]);

  const submit = useCallback(() => {
    const trimmed = value.trim();
    if (!trimmed || disabled) return;
    speech.stop();
    onSubmit(trimmed);
    setValue("");
  }, [value, disabled, onSubmit, speech]);

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      // Ignore Enter while an IME composition is open.
      if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
        event.preventDefault();
        submit();
      }
    },
    [submit],
  );

  const remaining = MAX_MESSAGE_LENGTH - value.length;
  const canSend = value.trim().length > 0 && !disabled;

  return (
    <div className={styles.wrapper}>
      {speech.isListening ? (
        <p className={styles.interim} aria-live="polite">
          {speech.interim || "Listening…"}
        </p>
      ) : null}

      {speech.error ? (
        <p className={styles.speechError} role="alert">
          {speech.error}{" "}
          <button type="button" onClick={speech.dismissError}>
            Dismiss
          </button>
        </p>
      ) : null}

      <form
        className={styles.composer}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <textarea
          ref={textareaRef}
          className={styles.input}
          value={value}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder={placeholder}
          aria-label="Message"
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
        />

        <div className={styles.actions}>
          {remaining < 200 ? <span className={styles.counter}>{remaining}</span> : null}

          {speech.isSupported ? (
            <MicButton
              isListening={speech.isListening}
              disabled={disabled}
              onToggle={speech.toggle}
            />
          ) : null}

          <button
            type="submit"
            className={styles.send}
            disabled={!canSend}
            aria-label="Send message"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <path d="M3.4 20.4 21 12 3.4 3.6 3.4 10.2 15 12 3.4 13.8z" fill="currentColor" />
            </svg>
          </button>
        </div>
      </form>
    </div>
  );
}
