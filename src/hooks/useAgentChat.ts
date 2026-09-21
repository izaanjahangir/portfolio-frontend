"use client";

import { useCallback, useMemo } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { DRAFT_THREAD } from "@/config/constants";
import { useConversation } from "@/reactQuery/useConversations";
import { useSendMessage } from "@/reactQuery/useChat";
import { queryKeys } from "@/reactQuery/queryKeys";
import { ApiError } from "@/utils/axios";
import { clearSession } from "@/utils/identity";
import { createMessage } from "@/utils/messages";
import { useIdentity } from "./useIdentity";
import type { AgentIdentity, ChatChannel, ChatMessage } from "@/types";

/**
 * Composes the chat resource hooks into everything a chat UI needs.
 *
 * This is the seam between data and presentation: components below it are
 * purely presentational, so the UI can be rebuilt without touching any of
 * the fetching, caching or identity logic.
 */

export interface UseAgentChatOptions {
  /** Shown as the first assistant message when there is no history. */
  greeting?: string;
  /** Rehydrate the stored session on mount. Default: true. */
  restoreSession?: boolean;
  /** Fired when the reply starts, with whether hosted audio is available. */
  onAssistantStart?: (messageId: string, ttsAvailable: boolean) => void;
  /** Fired per streamed chunk, with new text only. */
  onAssistantDelta?: (messageId: string, chunk: string) => void;
  /** Fired per synthesised sentence of a voice reply, in speaking order. */
  onAssistantAudio?: (messageId: string, clip: Blob) => void;
  /** Fired before any text with the answer's language, if reported. */
  onAssistantLanguage?: (messageId: string, language: string) => void;
  /** Fired with the assistant's reply the moment it lands. */
  onAssistantMessage?: (message: ChatMessage) => void;
  /** Fired when a send fails. */
  onSendError?: () => void;
}

export interface UseAgentChat {
  messages: ChatMessage[];
  /** True while the agent is composing an answer. */
  isSending: boolean;
  /** True once the answer has started arriving. */
  isStreaming: boolean;
  /** True while the stored conversation is being restored. */
  isRestoring: boolean;
  error: string | null;
  identity: AgentIdentity;
  /** `channel` tells the agent whether to write for reading or for hearing. */
  sendMessage: (text: string, channel?: ChatChannel) => void;
  /** Re-sends the last user message after a failure. */
  retryLast: () => void;
  /** Drops the current thread and starts a fresh one. */
  startNewConversation: () => void;
  dismissError: () => void;
}

export function useAgentChat(options: UseAgentChatOptions = {}): UseAgentChat {
  const {
    greeting,
    restoreSession = true,
    onAssistantStart,
    onAssistantDelta,
    onAssistantAudio,
    onAssistantLanguage,
    onAssistantMessage,
    onSendError,
  } = options;

  const queryClient = useQueryClient();
  const identity = useIdentity();

  const conversation = useConversation(identity.sessionId, restoreSession);
  const sendMutation = useSendMessage(identity, {
    onAssistantStart,
    onAssistantDelta,
    onAssistantAudio,
    onAssistantLanguage,
    onAssistantMessage,
    onError: onSendError,
  });

  const threadKey = queryKeys.conversation(identity.sessionId ?? DRAFT_THREAD);

  const greetingMessage = useMemo(
    () => (greeting ? createMessage("assistant", greeting) : null),
    [greeting],
  );

  const messages = useMemo(() => {
    const thread = conversation.data ?? [];
    if (thread.length === 0 && greetingMessage) return [greetingMessage];
    return thread;
  }, [conversation.data, greetingMessage]);

  const isStreaming = useMemo(
    () => messages.some((message) => message.streaming),
    [messages],
  );

  const sendMessage = useCallback(
    (text: string, channel: ChatChannel = "text") => {
      const trimmed = text.trim();
      if (!trimmed || sendMutation.isPending) return;
      sendMutation.mutate({ text: trimmed, channel });
    },
    [sendMutation],
  );

  const retryLast = useCallback(() => {
    if (sendMutation.isPending) return;

    const thread = queryClient.getQueryData<ChatMessage[]>(threadKey) ?? [];
    const lastUserIndex = thread.map((m) => m.role).lastIndexOf("user");
    if (lastUserIndex === -1) return;

    const lastUserMessage = thread[lastUserIndex];

    // Drop the failed attempt *and* any partial reply after it; the send
    // re-adds the question optimistically.
    queryClient.setQueryData<ChatMessage[]>(threadKey, thread.slice(0, lastUserIndex));
    // Retry on the same channel the failed message used.
    sendMutation.mutate({
      text: lastUserMessage.content,
      channel: lastUserMessage.channel ?? "text",
    });
  }, [sendMutation, queryClient, threadKey]);

  const startNewConversation = useCallback(() => {
    queryClient.removeQueries({
      queryKey: queryKeys.conversation(DRAFT_THREAD),
      exact: true,
    });
    sendMutation.reset();
    clearSession();
  }, [queryClient, sendMutation]);

  const error = useMemo(() => {
    if (!sendMutation.isError) return null;
    return sendMutation.error instanceof ApiError
      ? sendMutation.error.message
      : "Something went wrong while contacting the agent.";
  }, [sendMutation.isError, sendMutation.error]);

  return {
    messages,
    isSending: sendMutation.isPending,
    isStreaming,
    isRestoring: conversation.isLoading,
    error,
    identity,
    sendMessage,
    retryLast,
    startNewConversation,
    dismissError: sendMutation.reset,
  };
}
