"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

/**
 * App-wide React Query provider.
 *
 * The client is created in state rather than at module scope: on the server
 * a module-level client would be shared across requests and leak one
 * visitor's cache into another's render.
 *
 * Providers need a "use client" boundary, which is why they live outside
 * app/ — app/layout.tsx stays a server component and just renders this.
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // Our data only changes in response to the visitor, so
            // background refetching would just add noise and cost.
            refetchOnWindowFocus: false,
            refetchOnReconnect: false,
            retry: 1,
            staleTime: 60 * 1000,
          },
          mutations: { retry: 0 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {/* Compared against a literal so Next can statically replace
          process.env.NODE_ENV and drop this branch — and the import with
          it — from the production bundle. Do not hoist this into a
          variable, that defeats the dead-code elimination. */}
      {process.env.NODE_ENV === "development" ? (
        <ReactQueryDevtools initialIsOpen={false} buttonPosition="bottom-right" />
      ) : null}
    </QueryClientProvider>
  );
}
