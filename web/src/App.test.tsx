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
 */
test("the app mounts and renders the home route", async () => {
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
      name: "La guggen d’enfants de Fribourg, depuis 2002.",
    }),
  ).toBeInTheDocument();
});
