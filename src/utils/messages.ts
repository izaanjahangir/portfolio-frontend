import type { ChatMessage, MessageOut, MessageRole } from "@/types";

/** Helpers for building and normalising chat messages. */

let counter = 0;

/** Ids only need to be unique within a mounted list, not globally. */
export function createMessageId(prefix = "msg"): string {
  counter += 1;
  return `${prefix}-${counter}-${Date.now().toString(36)}`;
}

function normalizeRole(role: string): MessageRole {
  return role === "assistant" || role === "ai" ? "assistant" : "user";
}

export function createMessage(
  role: MessageRole,
  content: string,
  extra: Partial<ChatMessage> = {},
): ChatMessage {
  return {
    id: createMessageId(role),
    role,
    content,
    createdAt: new Date().toISOString(),
    ...extra,
  };
}

/** Maps the backend's conversation history onto client messages. */
export function fromMessageOut(messages: MessageOut[]): ChatMessage[] {
  return messages.map((message) => ({
    id: createMessageId("history"),
    role: normalizeRole(message.role),
    content: message.content,
    createdAt: message.created_at,
  }));
}
