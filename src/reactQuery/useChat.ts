"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postChat } from "@/apiService/chat";
import { DRAFT_THREAD } from "@/config/constants";
import { createMessage } from "@/utils/messages";
import { saveIdentity } from "@/utils/identity";
import { queryKeys } from "./queryKeys";
import type { AgentIdentity, ChatMessage, ChatResponse } from "@/types";

/** React Query bindings for /api/chat. */

interface SendMessageVariables {
  text: string;
}

interface SendMessageContext {
  optimisticId: string;
  sourceKey: readonly unknown[];
}

/**
 * Sends a message and keeps the cached transcript in step.
 *
 * The transcript lives in the React Query cache under the conversation key
 * rather than in component state, so it survives navigation and is shared
 * by every component reading the same session.
 */
export function useSendMessage(identity: AgentIdentity) {
  const queryClient = useQueryClient();
  const threadKey = queryKeys.conversation(identity.sessionId ?? DRAFT_THREAD);

  const readThread = (key: readonly unknown[] = threadKey): ChatMessage[] =>
    queryClient.getQueryData<ChatMessage[]>(key) ?? [];

  const writeThread = (key: readonly unknown[], messages: ChatMessage[]) => {
    queryClient.setQueryData<ChatMessage[]>(key, messages);
  };

  return useMutation<ChatResponse, Error, SendMessageVariables, SendMessageContext>({
    mutationFn: ({ text }) =>
      postChat({
        message: text,
        user_id: identity.userId,
        session_id: identity.sessionId,
      }),

    // Show the visitor's message immediately.
    onMutate: ({ text }) => {
      const optimistic = createMessage("user", text, { pending: true });
      writeThread(threadKey, [...readThread(), optimistic]);
      return { optimisticId: optimistic.id, sourceKey: threadKey };
    },

    onSuccess: (response, _variables, context) => {
      const settled = readThread().map((message) =>
        message.id === context.optimisticId ? { ...message, pending: false } : message,
      );
      const next = [...settled, createMessage("assistant", response.answer)];

      // The first reply mints the session id. Move the draft thread onto its
      // real key *before* saving the identity, so when the key changes the
      // query finds fresh data and never refetches what we already have.
      writeThread(queryKeys.conversation(response.session_id), next);

      if (context.sourceKey[2] !== response.session_id) {
        queryClient.removeQueries({ queryKey: context.sourceKey, exact: true });
      }

      saveIdentity({ userId: response.user_id, sessionId: response.session_id });
    },

    onError: (_error, _variables, context) => {
      if (!context) return;
      writeThread(
        context.sourceKey,
        readThread(context.sourceKey).map((message) =>
          message.id === context.optimisticId
            ? { ...message, pending: false, error: true }
            : message,
        ),
      );
    },
  });
}
