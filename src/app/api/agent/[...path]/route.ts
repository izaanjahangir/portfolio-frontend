import { NextRequest } from "next/server";
import { AGENT_UPSTREAM_URL } from "@/config/constants";

/**
 * Thin pass-through to the Python agent backend.
 *
 * Keeps the upstream URL server-side, sidesteps CORS, and gives us one
 * place to add rate limiting or auth later. Set AGENT_API_URL to point
 * at the deployed backend.
 */

export const dynamic = "force-dynamic";

/**
 * Request headers worth forwarding.
 *
 * `if-none-match` is what makes cached audio cheap: without it the backend
 * can never answer `304` and every replay re-downloads the whole file.
 */
const FORWARDED_REQUEST_HEADERS = ["accept", "if-none-match"];

/**
 * Response headers worth forwarding.
 *
 * Synthesised audio is immutable and the backend says so. Dropping these
 * made the browser re-fetch it on every replay.
 */
const FORWARDED_RESPONSE_HEADERS = ["cache-control", "etag"];

/** 304 and 204 must not carry a body; constructing one with it throws. */
function isBodyless(status: number): boolean {
  return status === 204 || status === 304;
}

async function proxy(request: NextRequest, path: string[]) {
  const search = request.nextUrl.search;
  const target = `${AGENT_UPSTREAM_URL}/${path.join("/")}${search}`;

  const headers = new Headers({
    "Content-Type": request.headers.get("content-type") ?? "application/json",
  });
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });

    const responseHeaders = new Headers({
      "Content-Type": upstream.headers.get("content-type") ?? "application/json",
    });
    for (const name of FORWARDED_RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }

    return new Response(isBodyless(upstream.status) ? null : upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { detail: "The agent backend is unreachable." },
      { status: 502 },
    );
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, (await params).path);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  return proxy(request, (await params).path);
}
