/**
 * Chat types. The `*Request` / `*Response` shapes mirror the FastAPI
 * schema at /openapi.json; the rest are ours.
 */

export type MessageRole = "user" | "assistant";

/**
 * Machine-readable facts the agent reports about one answer.
 *
 * Nullable on the wire, and observed to be null intermittently, so every
 * consumer must cope with its absence rather than assume the defaults.
 */
export interface ResponseMetadata {
  /** The exchange is finished; voice mode may close. */
  end_of_conversation: boolean;
  /** BCP-47 tag for the language of `answer`, used to pick a TTS voice. */
  language: string;
  /** The agent asked for something and needs a reply. */
  awaiting_input: boolean;
}

/** A message as returned by GET /api/conversations/{session_id}. */
export interface MessageOut {
  id: string;
  role: string;
  content: string;
  created_at: string;
  metadata?: ResponseMetadata | null;
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
  message_id: string;
  metadata?: ResponseMetadata | null;
}

/** Payload of the SSE `start` event, sent before generation begins. */
export interface ChatStreamStart {
  user_id: string;
  session_id: string;
  message_id: string;
}

/** Payload of the SSE `done` event. */
export interface ChatStreamDone {
  message_id: string;
  finish_reason: string;
  metadata?: ResponseMetadata | null;
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
  /**
   * The backend's message id once known. Assistant messages get theirs from
   * the stream's `start` event, before any text arrives, so the id never
   * changes mid-render.
   */
  id: string;
  role: MessageRole;
  content: string;
  createdAt: string;
  pending?: boolean;
  error?: boolean;
  /** Still receiving deltas. */
  streaming?: boolean;
  metadata?: ResponseMetadata | null;
}

/** Identity the agent uses to thread conversations together. */
export interface AgentIdentity {
  userId: string | null;
  sessionId: string | null;
}
