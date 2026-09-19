import { agentHttp } from "@/utils/axios";
import type { HealthData } from "@/types";
import type { RequestOptions } from "./types";

/** Endpoints under /api/health. */

export async function getHealth({ signal }: RequestOptions = {}): Promise<HealthData> {
  const { data } = await agentHttp.get<HealthData>("/api/health", { signal });
  return data;
}
