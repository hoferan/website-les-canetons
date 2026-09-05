import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import App from "./App";
import { SessionProvider } from "./session/SessionProvider";

/**
 * App owns the BrowserRouter, so this cannot use renderWithSession — that
 * helper supplies a MemoryRouter, and nesting two routers throws. The routes
 * themselves are covered in routes.test.tsx; what is asserted here is only that
 * the composition mounts and reaches a real page.
 *
 * jsdom's default location is "/", which during the R1a rebuild has no route
 * of its own (see routes.tsx) and falls through to the 404 view — that is
 * what proves the router, the layout and a page all mounted.
 */
test("the app mounts and renders a page", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <App />
      </SessionProvider>
    </QueryClientProvider>,
  );

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: "Page introuvable",
    }),
  ).toBeInTheDocument();
});
