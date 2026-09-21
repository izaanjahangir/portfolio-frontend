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

/** Where spoken answers get their audio. */
export type TtsProvider = "browser" | "elevenlabs";

/**
 * Default TTS provider, from NEXT_PUBLIC_TTS_PROVIDER.
 *
 * Defaults to "browser" deliberately: ElevenLabs credits are finite and
 * nothing should spend them unless it was asked to.
 *
 * NEXT_PUBLIC_* values are inlined at build time, so changing this needs a
 * dev-server restart. `TTS_PROVIDER_OVERRIDE_KEY` exists for flipping it
 * without one — see `utils/speak.ts`.
 */
export const TTS_PROVIDER: TtsProvider =
  process.env.NEXT_PUBLIC_TTS_PROVIDER === "elevenlabs" ? "elevenlabs" : "browser";

/** localStorage key that overrides TTS_PROVIDER at runtime, for testing. */
export const TTS_PROVIDER_OVERRIDE_KEY = "portfolio.agent.ttsProvider";
