import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { MemoryRouter } from "react-router-dom";

import { SessionProvider } from "../session/SessionProvider";

/**
 * Renders a node behind the real providers and WAITS FOR THE BOOT GATE.
 *
 * SessionProvider renders null until config and user have resolved, so a test
 * that asserts immediately after render() sees an empty tree and fails looking
 * like a component bug. Awaiting the marker here means every test starts from a
 * booted app.
 *
 * A fresh QueryClient per call, with retry off: tests must not share a cache
 * (one test's /events would satisfy the next one's), and a request that reaches
 * no handler should fail at once rather than after three retries.
 */
export async function renderWithSession(
  ui: ReactNode,
  { route = "/", state }: { route?: string; state?: unknown } = {},
) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // A plain string entry is parsed by the router into pathname/search/hash; an
  // OBJECT entry is not — its `pathname` is taken literally, so
  // "/login?returnTo=/x" would arrive with the query buried in the path and
  // `location.search` empty. Since state can only be supplied through the
  // object form, the split has to happen here.
  const [pathname = "/", query] = route.split("?");
  const entry = { pathname, search: query ? `?${query}` : "", state };

  const result = render(
    <MemoryRouter initialEntries={[entry]}>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <div data-testid="booted">{ui}</div>
        </SessionProvider>
      </QueryClientProvider>
    </MemoryRouter>,
  );

  await screen.findByTestId("booted");
  return result;
}
