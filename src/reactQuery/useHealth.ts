"use client";

import { useQuery } from "@tanstack/react-query";
import { getHealth } from "@/apiService/health";
import { queryKeys } from "./queryKeys";

/** React Query bindings for /api/health. */

export function useHealth() {
  return useQuery({
    queryKey: queryKeys.health(),
    queryFn: ({ signal }) => getHealth({ signal }),
  });
}
