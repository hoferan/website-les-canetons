import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

import { LeaveGuardProvider } from "../components/LeaveGuard";
import { setLocale } from "../i18n";
import { type Locale } from "../i18n/locale";
import { SessionProvider } from "../session/SessionProvider";

/**
 * Renders a node behind the real providers and waits for the boot gate.
 *
 * SessionProvider renders null until config and user have resolved, so a test
 * asserting straight after render() would see an empty tree.
 *
 * A fresh QueryClient per call, with retry off: tests must not share a cache,
 * and a request that reaches no handler should fail at once.
 */
export async function renderWithSession(
  ui: ReactNode,
  { route = "/", state, locale = "fr" }: { route?: string; state?: unknown; locale?: Locale } = {},
) {
  // Awaited: changeLanguage returns a promise, and an unawaited one would race
  // the first render.
  await setLocale(locale);

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  // An object entry's `pathname` is taken literally, so "/login?x=1" would
  // bury the query in the path. State needs the object form, so the split
  // happens here.
  const [pathname = "/", query] = route.split("?");
  const entry = { pathname, search: query ? `?${query}` : "", state };

  // A data router, like the app's, because `useBlocker` works under nothing
  // else. The splat route hands every path to whatever <Routes> `ui` holds.
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <QueryClientProvider client={queryClient}>
            <SessionProvider>
              <LeaveGuardProvider>
                <div data-testid="booted">{ui}</div>
              </LeaveGuardProvider>
            </SessionProvider>
          </QueryClientProvider>
        ),
      },
    ],
    { initialEntries: [entry] },
  );

  const result = render(<RouterProvider router={router} />);

  await screen.findByTestId("booted");
  return result;
}
