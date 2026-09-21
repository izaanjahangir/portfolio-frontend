"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { postChatStream } from "@/apiService/chat";
import { DRAFT_THREAD } from "@/config/constants";
import { createMessage } from "@/utils/messages";
import { saveIdentity } from "@/utils/identity";
import { queryKeys } from "./queryKeys";
import type { AgentIdentity, ChatChannel, ChatMessage, ChatResponse } from "@/types";

/** React Query bindings for /api/chat. */

interface SendMessageVariables {
  text: string;
  /** Which kind of answer to ask for. Defaults to "text". */
  channel?: ChatChannel;
}

export interface UseSendMessageOptions {
  /** Fired when the reply starts arriving, before any text. */
  onAssistantStart?: (messageId: string) => void;
  /** Fired per chunk, with **new** text only. */
  onAssistantDelta?: (messageId: string, chunk: string) => void;
  /** Fired with the assistant's reply once the stream completes. */
  onAssistantMessage?: (message: ChatMessage) => void;
  /** Fired when the send fails. */
  onError?: () => void;
}

/**
 * Sends a message and keeps the cached transcript in step as the answer
 * streams in.
 *
 * All cache writes happen inside `mutationFn` rather than being split
 * across onMutate/onSuccess: a stream mutates the same message many times,
 * and the session id it belongs to can change partway through (see the
 * draft migration below), so one place holding the live key is far easier
 * to follow than callbacks each re-deriving it.
 */
export function useSendMessage(
  identity: AgentIdentity,
  {
    onAssistantStart,
    onAssistantDelta,
    onAssistantMessage,
    onError,
  }: UseSendMessageOptions = {},
) {
  const queryClient = useQueryClient();

  const read = (key: readonly unknown[]): ChatMessage[] =>
    queryClient.getQueryData<ChatMessage[]>(key) ?? [];

  const write = (key: readonly unknown[], messages: ChatMessage[]) => {
    queryClient.setQueryData<ChatMessage[]>(key, messages);
  };

  const patch = (
    key: readonly unknown[],
    id: string,
    update: (message: ChatMessage) => ChatMessage,
  ) => {
    write(
      key,
      read(key).map((message) => (message.id === id ? update(message) : message)),
    );
  };

  return useMutation<ChatResponse, Error, SendMessageVariables>({
    mutationFn: async ({ text, channel = "text" }) => {
      // The thread may still be the draft; `start` tells us where it really
      // lives, and this is reassigned at that point.
      let key = queryKeys.conversation(identity.sessionId ?? DRAFT_THREAD);

      const userMessage = createMessage("user", text, { pending: true, channel });
      write(key, [...read(key), userMessage]);

      let assistantId: string | null = null;

      try {
        const response = await postChatStream(
          {
            message: text,
            user_id: identity.userId,
            session_id: identity.sessionId,
            channel,
          },
          {
            onStart: (event) => {
              // The first reply of a conversation mints the session id. Move
              // the draft thread onto its real key *before* saving identity,
              // so the query re-points onto data that is already correct and
              // never refetches what we are in the middle of streaming.
              const destination = queryKeys.conversation(event.session_id);
              if (destination[2] !== key[2]) {
                write(destination, read(key));
                queryClient.removeQueries({ queryKey: key, exact: true });
                key = destination;
              }

              // Using the backend's id from the outset means it never
              // changes mid-stream and React never remounts the bubble.
              assistantId = event.message_id;
              write(key, [
                ...read(key),
                {
                  id: event.message_id,
                  role: "assistant",
                  content: "",
                  createdAt: new Date().toISOString(),
                  streaming: true,
                },
              ]);

              saveIdentity({ userId: event.user_id, sessionId: event.session_id });
              onAssistantStart?.(event.message_id);
            },

            onDelta: (chunk) => {
              if (!assistantId) return;
              patch(key, assistantId, (message) => ({
                ...message,
                content: message.content + chunk,
              }));
              onAssistantDelta?.(assistantId, chunk);
            },
          },
        );

        patch(key, userMessage.id, (message) => ({ ...message, pending: false }));

        const settled: ChatMessage = {
          id: response.message_id,
          role: "assistant",
          content: response.answer,
          createdAt: new Date().toISOString(),
          metadata: response.metadata ?? null,
        };

        if (assistantId) {
          patch(key, assistantId, () => settled);
        } else {
          // No `start` arrived but the call resolved — keep the answer.
          write(key, [...read(key), settled]);
        }

        // Notified last, so listeners observe a cache that is already correct.
        onAssistantMessage?.(settled);
        return response;
      } catch (cause) {
        patch(key, userMessage.id, (message) => ({
          ...message,
          pending: false,
          error: true,
        }));

        // Drop an assistant bubble that never received real text; keep a
        // partial answer, since the visitor already saw it.
        if (assistantId) {
          const partial = read(key).find((message) => message.id === assistantId);
          if (partial && !partial.content.trim()) {
            write(key, read(key).filter((message) => message.id !== assistantId));
          } else if (partial) {
            patch(key, assistantId, (message) => ({
              ...message,
              streaming: false,
              error: true,
            }));
          }
        }

        throw cause;
      }
    },

    onError: () => {
      onError?.();
    },
  });
}
