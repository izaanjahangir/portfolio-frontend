/**
 * Every cache key in one place, so anything can invalidate anything
 * without guessing at key shapes.
 */
export const queryKeys = {
  agent: ["agent"] as const,
  health: () => [...queryKeys.agent, "health"] as const,
  conversation: (sessionId: string) =>
    [...queryKeys.agent, "conversation", sessionId] as const,
  userSessions: (userId: string) =>
    [...queryKeys.agent, "sessions", userId] as const,
};
