"use client";

import { useQuery } from "@tanstack/react-query";
import { getConversation } from "@/apiService/conversations";
import { DRAFT_THREAD } from "@/config/constants";
import { ApiError } from "@/utils/axios";
import { clearSession } from "@/utils/identity";
import { fromMessageOut } from "@/utils/messages";
import { queryKeys } from "./queryKeys";
import type { ChatMessage } from "@/types";

/** React Query bindings for /api/conversations. */

/**
 * The transcript for one session, mapped to client messages.
 *
 * Disabled until a session exists — before that the same cache key holds
 * the draft thread, written only by optimistic updates in `useSendMessage`.
 */
export function useConversation(sessionId: string | null, enabled = true) {
  return useQuery<ChatMessage[]>({
    queryKey: queryKeys.conversation(sessionId ?? DRAFT_THREAD),
    queryFn: async ({ signal }) => {
      try {
        const response = await getConversation(sessionId!, { signal });
        return fromMessageOut(response.messages);
      } catch (cause) {
        // A session the backend no longer knows about: forget it and start
        // clean rather than pinning the visitor to a dead thread.
        if (cause instanceof ApiError && cause.status === 404) {
          clearSession();
          return [];
        }
        throw cause;
      }
    },
    enabled: enabled && Boolean(sessionId),
    // The cache is the source of truth once loaded; every later change comes
    // from a mutation, so there is nothing to poll for.
    staleTime: Infinity,
    gcTime: 30 * 60 * 1000,
    retry: false,
  });
}
