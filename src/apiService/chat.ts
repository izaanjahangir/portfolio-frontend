import { AGENT_API_BASE } from "@/config/constants";
import { agentHttp, ApiError, extractErrorMessage } from "@/utils/axios";
import { readSseFrames } from "@/utils/sse";
import type {
  ChatRequest,
  ChatResponse,
  ChatStreamAudio,
  ChatStreamDone,
  ChatStreamLanguage,
  ChatStreamStart,
} from "@/types";
import type { RequestOptions } from "./types";

/** Endpoints under /api/chat. */

/** Sends a message. Omit session_id to start a new conversation. */
export async function postChat(
  payload: ChatRequest,
  { signal }: RequestOptions = {},
): Promise<ChatResponse> {
  const { data } = await agentHttp.post<ChatResponse>("/api/chat", payload, { signal });
  return data;
}

/** Callbacks fired as the stream arrives. */
export interface ChatStreamHandlers {
  /** Fired once, before generation — carries the ids to persist. */
  onStart?: (event: ChatStreamStart) => void;
  /** Fired per chunk with **new** text only; the caller concatenates. */
  onDelta?: (text: string) => void;
  /**
   * Fired at most once, before the first delta, with the language the
   * answer will be written in. Not guaranteed to arrive.
   */
  onLanguage?: (language: string) => void;
  /** Optional progress label while the agent uses a tool. */
  onStatus?: (label: string) => void;
  /**
   * Fired per chunk of the spoken reply, in order, while the text is still
   * streaming. The chunks are consecutive ranges of one recording, so they
   * are appended rather than played separately. `final` marks the last.
   */
  onAudio?: (chunk: Uint8Array, final: boolean) => void;
}

function parseJson<T>(data: string): T | null {
  try {
    return JSON.parse(data) as T;
  } catch {
    return null;
  }
}

/** base64 → bytes. Null for a chunk that arrives malformed. */
function decodeAudioChunk(b64: string): Uint8Array | null {
  try {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Streaming counterpart of `postChat`, over Server-Sent Events.
 *
 * Uses `fetch` rather than the shared axios instance on purpose: browser
 * axios buffers the entire response before resolving, so nothing would
 * arrive incrementally. The envelope-unwrapping interceptor is also wrong
 * here — SSE frames are not `{success, data}`.
 *
 * Resolves with the assembled answer once `done` arrives.
 */
export async function postChatStream(
  payload: ChatRequest,
  handlers: ChatStreamHandlers = {},
  { signal }: RequestOptions = {},
): Promise<ChatResponse> {
  let response: Response;

  try {
    response = await fetch(`${AGENT_API_BASE}/api/chat/stream`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") throw cause;
    throw new ApiError("Could not reach the agent. Is the server running?", 0, cause);
  }

  // Failures before the stream opens are ordinary HTTP responses.
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new ApiError(
      extractErrorMessage(body, `Request failed with status ${response.status}`),
      response.status,
      body,
    );
  }

  if (!response.body) {
    throw new ApiError("The agent returned an empty stream.", response.status);
  }

  let start: ChatStreamStart | null = null;
  let answer = "";

  for await (const frame of readSseFrames(response.body, signal)) {
    switch (frame.event) {
      case "start": {
        start = parseJson<ChatStreamStart>(frame.data);
        if (start) handlers.onStart?.(start);
        break;
      }

      case "delta": {
        const delta = parseJson<{ text?: string }>(frame.data);
        const text = delta?.text;
        if (!text) break;
        answer += text;
        handlers.onDelta?.(text);
        break;
      }

      case "language": {
        const payload = parseJson<ChatStreamLanguage>(frame.data);
        if (payload?.language) handlers.onLanguage?.(payload.language);
        break;
      }

      case "audio": {
        // Handed on in arrival order and never sorted: these are byte
        // ranges of one recording, so order is the file. A chunk that
        // won't decode is dropped — `done` still closes the recording,
        // so losing the one marked `final` cannot strand playback.
        const chunk = parseJson<ChatStreamAudio>(frame.data);
        if (!chunk?.b64) break;
        const bytes = decodeAudioChunk(chunk.b64);
        if (bytes) handlers.onAudio?.(bytes, chunk.final === true);
        break;
      }

      case "status": {
        const status = parseJson<{ label?: string }>(frame.data);
        if (status?.label) handlers.onStatus?.(status.label);
        break;
      }

      case "error": {
        // The status line is already committed to 200 by now, so mid-stream
        // failures arrive as an event rather than an HTTP error.
        const failure = parseJson<{ detail?: string; code?: string }>(frame.data);
        throw new ApiError(
          failure?.detail ?? "The agent stopped unexpectedly.",
          response.status,
          failure,
        );
      }

      // Unknown event names fall through deliberately: the protocol is
      // expected to grow, and an unrecognised frame is not an error.
      case "done": {
        const done = parseJson<ChatStreamDone>(frame.data);
        if (!start) {
          throw new ApiError("The agent stream ended without identifying itself.", response.status);
        }
        return {
          // Leading whitespace deltas are common; the answer is markdown,
          // so trimming the ends is safe and avoids a stray indent.
          answer: answer.trim(),
          user_id: start.user_id,
          session_id: start.session_id,
          message_id: done?.message_id ?? start.message_id,
          metadata: done?.metadata ?? null,
        };
      }
    }
  }

  // The connection closed without `done` — treat a partial answer as a
  // failure rather than passing off half a reply as complete.
  throw new ApiError("The agent stream ended unexpectedly.", response.status);
}
