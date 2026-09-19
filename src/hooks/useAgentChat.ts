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
import type { AgentIdentity, ChatMessage } from "@/types";

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
}

export interface UseAgentChat {
  messages: ChatMessage[];
  /** True while the agent is composing an answer. */
  isSending: boolean;
  /** True while the stored conversation is being restored. */
  isRestoring: boolean;
  error: string | null;
  identity: AgentIdentity;
  sendMessage: (text: string) => void;
  /** Re-sends the last user message after a failure. */
  retryLast: () => void;
  /** Drops the current thread and starts a fresh one. */
  startNewConversation: () => void;
  dismissError: () => void;
}

export function useAgentChat(options: UseAgentChatOptions = {}): UseAgentChat {
  const { greeting, restoreSession = true } = options;

  const queryClient = useQueryClient();
  const identity = useIdentity();

  const conversation = useConversation(identity.sessionId, restoreSession);
  const sendMutation = useSendMessage(identity);

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

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sendMutation.isPending) return;
      sendMutation.mutate({ text: trimmed });
    },
    [sendMutation],
  );

  const retryLast = useCallback(() => {
    if (sendMutation.isPending) return;

    const thread = queryClient.getQueryData<ChatMessage[]>(threadKey) ?? [];
    const lastUserMessage = [...thread].reverse().find((m) => m.role === "user");
    if (!lastUserMessage) return;

    // Drop the failed attempt; `onMutate` re-adds it optimistically.
    queryClient.setQueryData<ChatMessage[]>(
      threadKey,
      thread.filter((message) => message.id !== lastUserMessage.id),
    );
    sendMutation.mutate({ text: lastUserMessage.content });
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
    isRestoring: conversation.isLoading,
    error,
    identity,
    sendMessage,
    retryLast,
    startNewConversation,
    dismissError: sendMutation.reset,
  };
}
