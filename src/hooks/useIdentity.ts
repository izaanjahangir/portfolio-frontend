"use client";

import { useSyncExternalStore } from "react";
import {
  getIdentityServerSnapshot,
  getIdentitySnapshot,
  subscribeToIdentity,
} from "@/utils/identity";
import type { AgentIdentity } from "@/types";

/**
 * The visitor's `user_id` / `session_id`, kept in localStorage and shared
 * across every component that reads it (including other browser tabs).
 */
export function useIdentity(): AgentIdentity {
  return useSyncExternalStore(
    subscribeToIdentity,
    getIdentitySnapshot,
    getIdentityServerSnapshot,
  );
}
