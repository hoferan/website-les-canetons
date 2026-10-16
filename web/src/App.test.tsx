import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import App, { createAppRouter } from "./App";
import { SessionProvider } from "./session/SessionProvider";

/**
 * App owns the browser router, so this cannot use renderWithSession — that
 * helper supplies a memory router, and nesting two routers throws. The routes
 * themselves are covered in routes.test.tsx; what is asserted here is only that
 * the composition mounts and reaches a real page.
 *
 * jsdom's default location is "/", which the public home page now owns. Until
 * then it fell through to the catch-all and this test asserted the 404 view —
 * a fair proof that the router mounted, and a fair description of a site whose
 * own address answered "Page introuvable".
 */
test("the app mounts and renders a page", async () => {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <App router={createAppRouter()} />
      </SessionProvider>
    </QueryClientProvider>,
  );

  expect(
    await screen.findByRole("heading", {
      level: 1,
      name: /La guggen d’enfants de Fribourg/,
    }),
  ).toBeInTheDocument();
});
