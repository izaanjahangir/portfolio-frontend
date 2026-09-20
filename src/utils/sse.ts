/**
 * Minimal Server-Sent Events reader for `fetch` responses.
 *
 * The browser's `EventSource` only does GET, and the chat stream is a POST,
 * so the frames are parsed by hand off the response body.
 *
 * Note this cannot go through the shared axios instance: browser axios
 * buffers the whole response before resolving, which would defeat the
 * point. `fetch` exposes the body as a stream.
 */

export interface SseFrame {
  /** The `event:` name, or "message" when the frame omits one. */
  event: string;
  /** The joined `data:` lines. */
  data: string;
}

/**
 * Yields frames as they arrive.
 *
 * Network chunks split anywhere — mid-frame, mid-line, even mid-UTF-8
 * character — so text is decoded with `stream: true` and held in a buffer
 * until a frame is terminated by a blank line.
 */
export async function* readSseFrames(
  body: ReadableStream<Uint8Array>,
  signal?: AbortSignal,
): AsyncGenerator<SseFrame> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal?.aborted) return;

      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Frames are separated by a blank line; tolerate CRLF.
      let separator = findSeparator(buffer);
      while (separator !== null) {
        const raw = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator.length);

        const frame = parseFrame(raw);
        if (frame) yield frame;

        separator = findSeparator(buffer);
      }
    }

    // A final frame with no trailing blank line.
    const frame = parseFrame(buffer);
    if (frame) yield frame;
  } finally {
    // Releasing matters on early exit (abort, or the caller breaking out).
    reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

function findSeparator(buffer: string): { index: number; length: number } | null {
  const lf = buffer.indexOf("\n\n");
  const crlf = buffer.indexOf("\r\n\r\n");

  if (lf === -1 && crlf === -1) return null;
  if (crlf !== -1 && (lf === -1 || crlf < lf)) return { index: crlf, length: 4 };
  return { index: lf, length: 2 };
}

function parseFrame(raw: string): SseFrame | null {
  const lines = raw.split(/\r?\n/);
  let event = "message";
  const data: string[] = [];

  for (const line of lines) {
    // Comments (": ping" heartbeats) carry no payload.
    if (!line || line.startsWith(":")) continue;

    const colon = line.indexOf(":");
    const field = colon === -1 ? line : line.slice(0, colon);
    // One optional leading space after the colon is part of the framing.
    let value = colon === -1 ? "" : line.slice(colon + 1);
    if (value.startsWith(" ")) value = value.slice(1);

    if (field === "event") event = value;
    else if (field === "data") data.push(value);
  }

  if (data.length === 0) return null;
  return { event, data: data.join("\n") };
}
