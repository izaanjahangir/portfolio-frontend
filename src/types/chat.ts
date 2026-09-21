/**
 * Chat types. The `*Request` / `*Response` shapes mirror the FastAPI
 * schema at /openapi.json; the rest are ours.
 */

export type MessageRole = "user" | "assistant";

/**
 * How the visitor is talking to the agent.
 *
 * The agent writes differently for each: `voice` answers are short, plain
 * prose meant to be heard, `text` answers use markdown and go into more
 * detail. Sending the wrong one means reading bullet lists and bold
 * markers aloud, or showing a thin spoken answer on screen.
 */
export type ChatChannel = "text" | "voice";

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
  /**
   * Whether the backend would synthesise audio for this message right now:
   * TTS enabled, within budget, provider healthy.
   *
   * The single switch for browser voice vs. hosted audio. The frontend
   * holds no flag of its own — absent or false means use the browser.
   */
  tts_available?: boolean;
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
  /** Defaults to "text" server-side when omitted. */
  channel?: ChatChannel;
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
  /**
   * Whether hosted audio will be available for this answer.
   *
   * Needed here rather than only on `done`: by then the browser voice has
   * already started speaking, so the choice has to be made up front.
   */
  tts_available?: boolean;
}

/**
 * Payload of the SSE `language` event, sent once between `start` and the
 * first `delta`. Not guaranteed — a model may skip reporting it.
 */
export interface ChatStreamLanguage {
  language: string;
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
  /**
   * Channel a user message was sent on, so a retry asks for the same kind
   * of answer. Retrying a spoken question as text would fetch markdown and
   * then read it aloud.
   */
  channel?: ChatChannel;
  metadata?: ResponseMetadata | null;
}

/** Identity the agent uses to thread conversations together. */
export interface AgentIdentity {
  userId: string | null;
  sessionId: string | null;
}
