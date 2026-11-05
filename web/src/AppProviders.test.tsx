import { QueryClient } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, expect, test, vi } from "vitest";

import { AppProviders } from "./AppProviders";
import { server } from "./mocks/node";

afterEach(() => server.events.removeAllListeners());

const BOOT = ["/api/v1/blocks", "/api/v1/config", "/api/v1/me"];

test("the blocks, the config and the session are all asked for before any answers", async () => {
  // No boot read answers until all three have started, so a provider that
  // waits for another's answer before asking never asks, and the wait below
  // times out.
  const started = new Set<string>();
  let release!: () => void;
  const allStarted = new Promise<void>((resolve) => (release = resolve));

  const held = (path: string, body: () => Response) =>
    http.get(path, async () => {
      started.add(path);
      if (BOOT.every((boot) => started.has(boot))) release();
      await allStarted;
      return body();
    });

  server.use(
    held("/api/v1/blocks", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 100, offset: 0 } }),
    ),
    held("/api/v1/config", () => HttpResponse.json({ env: "dev", features: { calendar: true } })),
    held("/api/v1/me", () => HttpResponse.json({}, { status: 401 })),
  );

  render(
    <AppProviders queryClient={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <p>page</p>
    </AppProviders>,
  );

  // Well inside the blocks' 1.5 s wait, after which a gated session would
  // start anyway and hide the waterfall.
  await vi.waitFor(() => expect([...started].sort()).toEqual(BOOT), { timeout: 1000 });

  expect(await screen.findByText("page")).toBeInTheDocument();
});
