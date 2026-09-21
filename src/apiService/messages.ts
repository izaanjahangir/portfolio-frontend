import { AGENT_API_BASE } from "@/config/constants";
import type { RequestOptions } from "./types";

/** Endpoints under /api/messages. */

/**
 * Audio for one assistant message, or null when unavailable.
 *
 * Null is an ordinary outcome, not an error: the backend answers `503`
 * when the TTS quota is exhausted or the provider is down, `409` for a
 * message that isn't eligible, and `404` before the endpoint exists at
 * all. Every one of those means "use the browser's own voice instead",
 * so they are flattened into null rather than thrown.
 *
 * Deliberately addressed by message id — never by arbitrary text. An
 * endpoint that speaks anything it is given is a paid TTS service anyone
 * can bill to us.
 */
export async function getMessageAudio(
  messageId: string,
  { signal }: RequestOptions = {},
): Promise<Blob | null> {
  try {
    const response = await fetch(
      `${AGENT_API_BASE}/api/messages/${encodeURIComponent(messageId)}/audio`,
      { signal, headers: { Accept: "audio/mpeg" } },
    );

    if (!response.ok) return null;

    const blob = await response.blob();
    return blob.size > 0 ? blob : null;
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    return null;
  }
}
