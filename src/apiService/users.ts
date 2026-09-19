import { agentHttp } from "@/utils/axios";
import type { SessionsResponse } from "@/types";
import type { RequestOptions } from "./types";

/** Endpoints under /api/users. */

/** A visitor's conversation ids, most recent first. */
export async function getUserSessions(
  userId: string,
  { signal }: RequestOptions = {},
): Promise<SessionsResponse> {
  const { data } = await agentHttp.get<SessionsResponse>(
    `/api/users/${encodeURIComponent(userId)}/sessions`,
    { signal },
  );
  return data;
}
