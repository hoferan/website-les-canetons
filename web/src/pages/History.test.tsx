import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { History } from "./History";

async function renderHistory(
  locale: Locale = "fr",
  user: Parameters<typeof setMockUser>[0] = null,
) {
  setMockUser(user);
  await renderWithSession(<History />, { route: "/history", locale });
  return screen.findByTestId("history-timeline");
}

test("the entries render oldest first, with dates in the page's language", async () => {
  const timeline = await renderHistory();
  const items = within(timeline).getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(items[0]).toHaveTextContent("octobre 2002");
  expect(items[1]).toHaveTextContent("2007");
});

test("an entry without a title shows its date and text", async () => {
  const timeline = await renderHistory();
  const second = within(timeline).getAllByRole("listitem")[1] as HTMLElement;
  expect(within(second).queryByRole("heading")).toBeNull();
  expect(second).toHaveTextContent("Dès la saison 2007/2008");
});

test("an important entry says so to a screen reader", async () => {
  const timeline = await renderHistory();
  const first = within(timeline).getAllByRole("listitem")[0] as HTMLElement;
  expect(
    within(first).getByRole("heading", { name: /Étape importante.*Les débuts/ }),
  ).toBeInTheDocument();
});

test("on the German page, an entry with German is German and one without is French, marked", async () => {
  const timeline = await renderHistory("de-CH");
  const items = within(timeline).getAllByRole("listitem");
  expect(items[2]).toHaveTextContent("Delphine Maillard und Laura Mantel");
  expect(items[2]).not.toHaveAttribute("lang");
  expect(items[0]).toHaveAttribute("lang", "fr");
  // The note is in the page's language, not the entry's.
  const note = within(items[0] as HTMLElement).getByText("Auf Französisch");
  expect(note).toHaveAttribute("lang", "de-CH");
});

test("a German-only entry on the French page is German, marked", async () => {
  server.use(
    http.get("/api/v1/history", () =>
      HttpResponse.json({
        data: [
          {
            id: 9,
            occurredOn: "2020-01-01",
            precision: "year",
            important: false,
            icon: "rocket",
            titleFr: null,
            bodyFr: null,
            titleDe: "Nur Deutsch",
            bodyDe: null,
            createdAt: "2026-09-26T00:00:00+00:00",
            updatedAt: "2026-09-26T00:00:00+00:00",
          },
        ],
        meta: { total: 1, limit: 500, offset: 0 },
      }),
    ),
  );
  const timeline = await renderHistory();
  const only = within(timeline).getByRole("listitem");
  expect(only).toHaveAttribute("lang", "de-CH");
  expect(only).toHaveTextContent("En allemand");
  expect(only).toHaveTextContent("Nur Deutsch");
});

test("no editing controls without history.manage", async () => {
  await renderHistory("fr", "demo.player");
  expect(screen.queryByRole("link", { name: /Ajouter/ })).toBeNull();
  expect(screen.queryByRole("link", { name: /^Modifier/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /^Supprimer/ })).toBeNull();
});

test("an editor sees Ajouter, and Modifier and Supprimer on every entry", async () => {
  await renderHistory("fr", "demo.direction");
  expect(screen.getByRole("link", { name: /Ajouter/ })).toHaveAttribute("href", "/history/new");
  // Two actions per row, so RowActions draws both inline and no "…" menu.
  expect(screen.getAllByRole("link", { name: /^Modifier / })).toHaveLength(4);
  expect(screen.getAllByRole("button", { name: /^Supprimer / })).toHaveLength(4);
  expect(screen.getByRole("link", { name: "Modifier cette entrée" })).toHaveAttribute(
    "href",
    "/history/2/edit",
  );
});

test("deleting an entry removes it after the confirmation", async () => {
  const user = userEvent.setup();
  await renderHistory("fr", "demo.direction");
  await user.click(screen.getByRole("button", { name: "Supprimer Le flambeau passe" }));
  await user.click(await screen.findByRole("button", { name: "Supprimer" }));
  await expect.poll(() => screen.queryByText("Le flambeau passe")).toBeNull();
});
