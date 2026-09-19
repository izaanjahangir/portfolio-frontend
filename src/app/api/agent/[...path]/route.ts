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

async function proxy(request: NextRequest, path: string[]) {
  const search = request.nextUrl.search;
  const target = `${AGENT_UPSTREAM_URL}/${path.join("/")}${search}`;

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers: {
        "Content-Type": request.headers.get("content-type") ?? "application/json",
      },
      body: request.method === "GET" ? undefined : await request.text(),
      cache: "no-store",
    });

    return new Response(upstream.body, {
      status: upstream.status,
      headers: {
        "Content-Type": upstream.headers.get("content-type") ?? "application/json",
      },
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
