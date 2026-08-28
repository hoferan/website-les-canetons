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
export async function renderWithSession(ui: ReactNode, { route = "/" }: { route?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  const result = render(
    <MemoryRouter initialEntries={[route]}>
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
