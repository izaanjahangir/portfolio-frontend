/**
 * App-wide constants. Anything configurable lives here, not inline.
 */

/** Base URL the browser calls. Points at the Next proxy by default. */
export const AGENT_API_BASE =
  process.env.NEXT_PUBLIC_AGENT_API_BASE ?? "/api/agent";

/** Base URL the Next server proxies to. Never exposed to the browser. */
export const AGENT_UPSTREAM_URL = (
  process.env.AGENT_API_URL ?? "http://127.0.0.1:8000"
).replace(/\/$/, "");

/** Backend caps the message at 4000 chars (ChatRequest.message maxLength). */
export const MAX_MESSAGE_LENGTH = 4000;

/** localStorage keys. Namespaced so they don't collide with anything else. */
export const STORAGE_KEYS = {
  userId: "portfolio.agent.userId",
  sessionId: "portfolio.agent.sessionId",
} as const;

/** Cache key for a conversation the backend hasn't created yet. */
export const DRAFT_THREAD = "draft";
