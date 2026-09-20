import axios, { AxiosError, type AxiosInstance } from "axios";
import { AGENT_API_BASE } from "@/config/constants";
import type { SuccessResponse } from "@/types";

/**
 * Shared axios setup.
 *
 * Every call to the agent backend goes through `agentHttp`, which unwraps
 * the `{ success, data }` envelope and normalises failures, so callers deal
 * with payloads and one error type instead of raw responses.
 */

/** Thrown for any failed request or malformed envelope. */
export class ApiError extends Error {
  readonly status: number;
  readonly detail?: unknown;

  constructor(message: string, status: number, detail?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

/** Pulls a human-readable message out of FastAPI's error shapes. */
export function extractErrorMessage(payload: unknown, fallback: string): string {
  if (payload && typeof payload === "object" && "detail" in payload) {
    const { detail } = payload as { detail: unknown };
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail) && detail.length > 0) {
      const first = detail[0] as { msg?: string };
      if (first?.msg) return first.msg;
    }
  }
  return fallback;
}

export const agentHttp: AxiosInstance = axios.create({
  baseURL: AGENT_API_BASE,
  headers: { "Content-Type": "application/json" },
});

agentHttp.interceptors.response.use(
  (response) => {
    const envelope = response.data as SuccessResponse<unknown> | null;

    if (!envelope || typeof envelope !== "object" || !("data" in envelope)) {
      throw new ApiError(
        "Unexpected response shape from the agent.",
        response.status,
        response.data,
      );
    }

    response.data = envelope.data;
    return response;
  },
  (error: unknown) => {
    // Cancellations pass through so React Query can tell an abort apart
    // from a real failure.
    if (axios.isCancel(error)) return Promise.reject(error);

    if (error instanceof AxiosError) {
      if (error.response) {
        return Promise.reject(
          new ApiError(
            extractErrorMessage(
              error.response.data,
              `Request failed with status ${error.response.status}`,
            ),
            error.response.status,
            error.response.data,
          ),
        );
      }

      return Promise.reject(
        new ApiError("Could not reach the agent. Is the server running?", 0, error),
      );
    }

    return Promise.reject(error);
  },
);
