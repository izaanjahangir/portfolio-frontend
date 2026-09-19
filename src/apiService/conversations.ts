import { agentHttp } from "@/utils/axios";
import type { ConversationResponse } from "@/types";
import type { RequestOptions } from "./types";

/** Endpoints under /api/conversations. */

/** Full message history of one conversation, for rebuilding the UI. */
export async function getConversation(
  sessionId: string,
  { signal }: RequestOptions = {},
): Promise<ConversationResponse> {
  const { data } = await agentHttp.get<ConversationResponse>(
    `/api/conversations/${encodeURIComponent(sessionId)}`,
    { signal },
  );
  return data;
}
