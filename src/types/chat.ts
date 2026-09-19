/**
 * Chat types. The `*Request` / `*Response` shapes mirror the FastAPI
 * schema at /openapi.json; the rest are ours.
 */

export type MessageRole = "user" | "assistant";

/** A message as returned by GET /api/conversations/{session_id}. */
export interface MessageOut {
  role: string;
  content: string;
  created_at: string;
}

export interface ChatRequest {
  message: string;
  user_id?: string | null;
  session_id?: string | null;
}

export interface ChatResponse {
  answer: string;
  user_id: string;
  session_id: string;
}

export interface ConversationResponse {
  session_id: string;
  messages: MessageOut[];
}

export interface SessionsResponse {
  user_id: string;
  session_ids: string[];
}

/** Client-side message. `pending` marks an optimistic message in flight. */
export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  pending?: boolean;
  error?: boolean;
}

/** Identity the agent uses to thread conversations together. */
export interface AgentIdentity {
  userId: string | null;
  sessionId: string | null;
}
