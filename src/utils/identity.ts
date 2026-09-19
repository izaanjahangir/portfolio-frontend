import { STORAGE_KEYS } from "@/config/constants";
import type { AgentIdentity } from "@/types";

/**
 * localStorage-backed store for the visitor's `user_id` / `session_id`.
 *
 * The backend mints both on the first chat call and echoes them back; we
 * persist them so a returning visitor keeps their thread.
 *
 * Exposed as an external store (consumed by `useIdentity` via
 * useSyncExternalStore) rather than component state: localStorage does not
 * exist during SSR, and this gives a correct server snapshot instead of a
 * hydration mismatch.
 */

const EMPTY: AgentIdentity = { userId: null, sessionId: null };

const listeners = new Set<() => void>();

// getSnapshot must return a referentially stable value between changes,
// so the parsed identity is cached and only rebuilt on write.
let snapshot: AgentIdentity | null = null;

function readKey(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    // Private mode / disabled storage — degrade to a fresh session.
    return null;
  }
}

function writeKey(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // Non-fatal: the chat still works, it just won't persist.
  }
}

export function subscribeToIdentity(listener: () => void): () => void {
  listeners.add(listener);

  // Keep other tabs of the portfolio in sync.
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEYS.userId || event.key === STORAGE_KEYS.sessionId) {
      snapshot = null;
      listener();
    }
  };

  window.addEventListener("storage", onStorage);

  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function getIdentitySnapshot(): AgentIdentity {
  if (typeof window === "undefined") return EMPTY;

  if (snapshot === null) {
    snapshot = {
      userId: readKey(STORAGE_KEYS.userId),
      sessionId: readKey(STORAGE_KEYS.sessionId),
    };
  }

  return snapshot;
}

/** Stable empty identity for the server render. */
export function getIdentityServerSnapshot(): AgentIdentity {
  return EMPTY;
}

export function saveIdentity({ userId, sessionId }: AgentIdentity): void {
  writeKey(STORAGE_KEYS.userId, userId);
  writeKey(STORAGE_KEYS.sessionId, sessionId);
  snapshot = { userId, sessionId };
  for (const listener of listeners) listener();
}

/** Forgets the current conversation but keeps the visitor identity. */
export function clearSession(): void {
  saveIdentity({ userId: getIdentitySnapshot().userId, sessionId: null });
}
