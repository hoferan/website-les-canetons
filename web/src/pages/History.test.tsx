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
  expect(items[2]?.querySelector("[lang]")).toBeNull();
  // The entry's own text carries its language; the note is page copy.
  expect(
    within(items[0] as HTMLElement)
      .getByText("Les débuts")
      .closest("[lang]"),
  ).toHaveAttribute("lang", "fr");
  expect(
    within(items[0] as HTMLElement)
      .getByText("Auf Französisch")
      .closest('[lang="fr"]'),
  ).toBeNull();
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
  expect(only).toHaveTextContent("En allemand");
  expect(within(only).getByText("Nur Deutsch").closest("[lang]")).toHaveAttribute("lang", "de-CH");
  // LANG ON THE ENTRY'S TEXT ONLY: the date is formatted in the page's
  // language and must not be read with a German voice.
  expect(within(only).getByText("2020").closest('[lang="de-CH"]')).toBeNull();
});

test("editing and deleting are named in the page's language and word order", async () => {
  await renderHistory("de-CH", "demo.direction");
  expect(screen.getByRole("link", { name: "Le flambeau passe bearbeiten" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "diesen Eintrag löschen" })).toBeInTheDocument();
});

/**
 * THE DELETE QUOTES THE TAG FROM WHEN THE DIALOG OPENED, not a fresher one
 * read at the moment of confirming, which would let a colleague's rewrite in
 * between be deleted silently.
 */
test("a delete confirmed after somebody changed the entry is refused, and says so", async () => {
  const user = userEvent.setup();
  let version = "v1";
  server.use(
    http.get("/api/v1/history/:id", ({ params }) =>
      HttpResponse.json(
        {
          id: Number(params.id),
          occurredOn: "2026-01-01",
          precision: "year",
          important: false,
          icon: "users",
          titleFr: "Le flambeau passe",
          bodyFr: null,
          titleDe: null,
          bodyDe: null,
          createdAt: "2026-09-26T00:00:00+00:00",
          updatedAt: "2026-09-26T00:00:00+00:00",
        },
        { headers: { ETag: `"${version}"` } },
      ),
    ),
    http.delete("/api/v1/history/:id", ({ request }) =>
      request.headers.get("If-Match") === `"${version}"`
        ? HttpResponse.json({ ok: true })
        : HttpResponse.json(
            {
              title: "Precondition Failed",
              status: 412,
              code: "if_match_failed",
              instance: "/api/v1/history/4",
              errors: [],
              requestId: "01JB3K7QW8ZX7VN4S2QK9J0M1P",
              detail: "stale",
            },
            { status: 412 },
          ),
    ),
  );
  await renderHistory("fr", "demo.direction");
  await user.click(screen.getByRole("button", { name: "Supprimer Le flambeau passe" }));
  const dialog = await screen.findByRole("alertdialog");

  version = "v2"; // a colleague saves a change while the dialog is open

  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));
  expect(
    await within(dialog).findByText(/Quelqu'un a modifié cet élément entre-temps/),
  ).toBeInTheDocument();
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
