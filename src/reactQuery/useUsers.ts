"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserSessions } from "@/apiService/users";
import { queryKeys } from "./queryKeys";

/** React Query bindings for /api/users. */

/** A visitor's past conversations, most recent first. */
export function useUserSessions(userId: string | null) {
  return useQuery({
    queryKey: queryKeys.userSessions(userId ?? ""),
    queryFn: ({ signal }) => getUserSessions(userId!, { signal }),
    enabled: Boolean(userId),
  });
}
