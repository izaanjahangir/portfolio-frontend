"use client";

import { useSyncExternalStore } from "react";

/** Nothing to subscribe to — the value never changes after hydration. */
const subscribeNoop = () => () => {};
const serverSnapshot = () => false;

/**
 * Reads a browser-only capability flag without breaking hydration.
 *
 * Feature detection returns false on the server and true in the browser.
 * Branching on that directly produces markup that differs between the two
 * renders, which React rejects. useSyncExternalStore is the supported way
 * to express it: React uses the server snapshot while hydrating, then
 * re-renders with the client value.
 */
export function useClientFlag(detect: () => boolean): boolean {
  return useSyncExternalStore(subscribeNoop, detect, serverSnapshot);
}
