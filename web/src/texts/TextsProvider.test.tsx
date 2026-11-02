import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, delay, http } from "msw";
import { expect, test, vi } from "vitest";

import { t } from "../i18n";
import { server } from "../mocks/node";
import { TextsProvider } from "./TextsProvider";

function Probe() {
  return <p data-testid="intro">{t("join.intro")}</p>;
}

function renderProvider() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TextsProvider>
        <Probe />
      </TextsProvider>
    </QueryClientProvider>,
  );
}

const stored = (fr: string) =>
  http.get("/api/v1/texts", () =>
    HttpResponse.json({
      data: [{ key: "join.intro", fr, de: null, updatedAt: "2026-11-02T10:00:00+00:00" }],
      meta: { total: 1, limit: 100, offset: 0 },
    }),
  );

test("children wait for the texts", async () => {
  server.use(
    http.get("/api/v1/texts", async () => {
      await delay("infinite");
      return HttpResponse.json({});
    }),
  );
  renderProvider();

  // A first paint in the catalogue wording would flash, then change.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(screen.queryByTestId("intro")).toBeNull();
});

test("the stored texts reach t() before the children render", async () => {
  server.use(stored("Viens jouer avec nous !"));
  renderProvider();

  expect(await screen.findByTestId("intro")).toHaveTextContent("Viens jouer avec nous !");
});

test("the page title follows a stored title", async () => {
  server.use(
    http.get("/api/v1/texts", () =>
      HttpResponse.json({
        data: [
          { key: "meta.title", fr: "La guggen", de: null, updatedAt: "2026-11-02T10:00:00+00:00" },
        ],
        meta: { total: 1, limit: 100, offset: 0 },
      }),
    ),
  );
  renderProvider();

  await screen.findByTestId("intro");
  expect(document.title).toBe("La guggen");
});

test("a failing texts request still renders the children with the catalogue wording", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  server.use(http.get("/api/v1/texts", () => HttpResponse.json({}, { status: 500 })));
  renderProvider();

  // Compared exactly: the catalogue wording carries no-break spaces, which
  // toHaveTextContent normalises on one side only.
  expect((await screen.findByTestId("intro")).textContent).toBe(t("join.intro"));
});
