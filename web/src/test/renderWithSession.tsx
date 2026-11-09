import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { RouterProvider, createMemoryRouter } from "react-router-dom";

import { LeaveGuardProvider } from "../components/LeaveGuard";
import { BlocksGate, BlocksProvider } from "../content/BlocksProvider";
import { setLocale } from "../i18n";
import { localizePath, splitLocale, type Locale } from "../i18n/locale";
import { LocaleFromUrl } from "../i18n/routing";
import { SessionProvider } from "../session/SessionProvider";
import { EditModeProvider } from "../content/EditMode";

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
  const [path = "/", query] = route.split("?");
  // The URL decides the language, as in the app, so a German test starts on
  // the German URL of the page it names.
  const pathname = splitLocale(path).locale === locale ? path : localizePath(path, locale);
  const entry = { pathname, search: query ? `?${query}` : "", state };

  // A data router, like the app's, because `useBlocker` works under nothing
  // else. The splat route hands every path to whatever <Routes> `ui` holds,
  // with the German segment taken off, as the app's route table sees it.
  const router = createMemoryRouter(
    [
      {
        path: "*",
        element: (
          <QueryClientProvider client={queryClient}>
            <BlocksProvider>
              <SessionProvider>
                <BlocksGate>
                  <EditModeProvider>
                    <LeaveGuardProvider>
                      <LocaleFromUrl>
                        <div data-testid="booted">{ui}</div>
                      </LocaleFromUrl>
                    </LeaveGuardProvider>
                  </EditModeProvider>
                </BlocksGate>
              </SessionProvider>
            </BlocksProvider>
          </QueryClientProvider>
        ),
      },
    ],
    { initialEntries: [entry] },
  );

  const result = render(<RouterProvider router={router} />);

  await screen.findByTestId("booted");
  // The router too, whose location is the URL as the browser would show it.
  return { ...result, router };
}
