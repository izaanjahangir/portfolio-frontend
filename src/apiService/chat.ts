import { agentHttp } from "@/utils/axios";
import type { ChatRequest, ChatResponse } from "@/types";
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
