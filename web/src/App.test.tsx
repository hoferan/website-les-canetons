import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import App, { createAppRouter } from "./App";
import { SessionProvider } from "./session/SessionProvider";

/**
 * App owns the browser router, so this cannot use renderWithSession, whose
 * memory router would nest and throw. routes.test.tsx covers the routes; this
 * asserts only that the composition mounts and reaches the home page at
 * jsdom's default location "/".
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
