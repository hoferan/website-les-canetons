import { screen, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import type { HistoryEntryResource } from "../api/generated/model";
import { EDIT_MODE_KEY } from "../content/EditMode";
import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { History } from "./History";

async function renderHistory(
  locale: Locale = "fr",
  user: Parameters<typeof setMockUser>[0] = null,
  // The controls show in edit mode only, so a signed-in editor edits by default.
  editing = user !== null,
) {
  if (editing) sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser(user);
  await renderWithSession(<History />, { route: "/history", locale });
  return screen.findByTestId("history-timeline");
}

/** An entry's ⋯ on its chip. */
const more = (name: string) =>
  screen.getByRole("button", { name: `Plus d’actions\u00a0: ${name}` });

/** Opens an entry's ⋯ and picks Supprimer, which asks first. */
async function chooseDelete(user: UserEvent, name: string) {
  await user.click(more(name));
  await user.click(await screen.findByRole("menuitem", { name: "Supprimer" }));
}

test("the entries render oldest first, with dates in the page's language", async () => {
  const timeline = await renderHistory();
  const items = within(timeline).getAllByRole("listitem");
  expect(items).toHaveLength(4);
  expect(items[0]).toHaveTextContent("octobre 2002");
  expect(items[1]).toHaveTextContent("2007");
});

/**
 * The date is in the heading: on a timeline the year is the landmark, so
 * heading navigation has to reach it, and an untitled entry still gets one.
 */
test("an entry without a title has its date as its heading, and its text", async () => {
  const timeline = await renderHistory();
  const second = within(timeline).getAllByRole("listitem")[1] as HTMLElement;
  expect(within(second).getByRole("heading", { level: 2 })).toHaveAccessibleName("2007");
  expect(second).toHaveTextContent("Dès la saison 2007/2008");
});

test("a titled entry's heading carries its date too, apart from the title", async () => {
  await renderHistory();
  expect(
    screen.getByRole("heading", { name: /^Étape importante.+octobre 2002, Les débuts$/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "2019, Delphine Maillard et Laura Mantel" }),
  ).toBeInTheDocument();
});

/**
 * The card opens on its year, large, with the month or the day beside it.
 * That picture is a screen reader's too much: the heading already says the
 * date in words.
 */
test("a card shows its year large, with the month beside it, hidden from a screen reader", async () => {
  const timeline = await renderHistory();
  const first = within(timeline).getAllByRole("listitem")[0] as HTMLElement;
  const year = within(first).getByText("2002");
  expect(year.closest("[aria-hidden='true']")).not.toBeNull();
  expect(within(first).getByText("octobre").closest("[aria-hidden='true']")).not.toBeNull();
  // A year entry has nothing beside its year.
  const second = within(timeline).getAllByRole("listitem")[1] as HTMLElement;
  expect(within(second).getByText("2007", { selector: "[aria-hidden='true'] *" })).toBeVisible();
});

test("the importance is announced in the page's own punctuation", async () => {
  await renderHistory("de-CH");
  expect(
    screen.getByRole("heading", { name: /^Wichtiger Meilenstein: Oktober 2002/ }),
  ).toBeInTheDocument();
});

test("Ajouter says what it adds to", async () => {
  await renderHistory("fr", "demo.direction");
  expect(screen.getByRole("button", { name: "Ajouter à l’histoire" })).toHaveTextContent("Ajouter");
});

test("Ajouter leads with its plus, as every add control does", async () => {
  await renderHistory("fr", "demo.direction");
  const add = screen.getByRole("button", { name: "Ajouter à l’histoire" });
  expect(add.firstChild?.nodeName.toLowerCase()).toBe("svg");
  expect(add.lastChild).toHaveTextContent("Ajouter");
});

test("the delete dialog names the entry it deletes", async () => {
  const user = userEvent.setup();
  await renderHistory("fr", "demo.direction");
  await chooseDelete(user, "Le flambeau passe");
  expect(
    await screen.findByRole("alertdialog", {
      name: "Supprimer « Le flambeau passe » (2026) ?",
    }),
  ).toBeInTheDocument();
  await user.keyboard("{Escape}");

  await chooseDelete(user, "l’entrée de 2007");
  expect(
    await screen.findByRole("alertdialog", { name: "Supprimer l’entrée de 2007 ?" }),
  ).toBeInTheDocument();
});

test("cancelling a delete gives focus back to the entry's ⋯, and a delete to Ajouter", async () => {
  const user = userEvent.setup();
  await renderHistory("fr", "demo.direction");

  await chooseDelete(user, "Le flambeau passe");
  await user.click(await screen.findByRole("button", { name: "Annuler" }));
  await expect.poll(() => more("Le flambeau passe")).toHaveFocus();

  await chooseDelete(user, "Le flambeau passe");
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));
  await expect.poll(() => screen.queryByText("Le flambeau passe")).toBeNull();
  expect(screen.getByRole("button", { name: "Ajouter à l’histoire" })).toHaveFocus();
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
  // lang on the entry's text only: the date is in the page's language and
  // must not be read with a German voice.
  expect(within(only).getByText("2020").closest('[lang="de-CH"]')).toBeNull();
});

test("the strip is named in the page's language and word order", async () => {
  const user = userEvent.setup();
  await renderHistory("de-CH", "demo.direction");
  expect(screen.getByRole("toolbar", { name: "Le flambeau passe" })).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Delphine Maillard und Laura Mantel bearbeiten" }),
  ).toHaveTextContent("Bearbeiten");
  await user.click(screen.getByRole("button", { name: "Weitere Aktionen: den Eintrag von 2007" }));
  expect(await screen.findByRole("menuitem", { name: "Löschen" })).toBeInTheDocument();
});

/**
 * Only a text with French and no German is missing its German. A German-only
 * entry lacks nothing the page can show in German, and the flag is the
 * corner of ✎, said in its name, as on a card.
 */
test("an entry with French and no German flags its ✎, and says so", async () => {
  serveOnly(
    { ...untitled(1, "2002-10-01", "month"), bodyDe: null },
    untitled(2, "2023-11-11", "day"),
    { ...untitled(3, "2019-01-01", "year"), bodyFr: null },
  );
  await renderHistory("fr", "demo.direction");
  const missing = screen.getByRole("button", {
    name: "Modifier l’entrée d’octobre 2002 (sans allemand)",
  });
  expect(missing.querySelector("[data-flag]")).not.toBeNull();
  for (const name of ["Modifier l’entrée du 11.11.2023", "Modifier l’entrée de 2019"]) {
    expect(screen.getByRole("button", { name }).querySelector("[data-flag]")).toBeNull();
  }
});

/**
 * The delete quotes the tag from when the dialog opened. A fresher one read
 * on confirming would let a colleague's rewrite in between be deleted
 * silently.
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
  await chooseDelete(user, "Le flambeau passe");
  const dialog = await screen.findByRole("alertdialog");

  version = "v2"; // a colleague saves a change while the dialog is open

  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));
  expect(
    await within(dialog).findByText(/Quelqu'un a modifié cet élément entre-temps/),
  ).toBeInTheDocument();
});

test("no editing controls without history.manage", async () => {
  await renderHistory("fr", "demo.player");
  expect(screen.queryByRole("button", { name: /Ajouter/ })).toBeNull();
  expect(screen.queryByRole("toolbar")).toBeNull();
});

test("an editor sees Ajouter, and a strip of ⋯ ✎ on every card, with no arrows", async () => {
  await renderHistory("fr", "demo.direction");
  expect(screen.getByRole("button", { name: /Ajouter/ })).toBeInTheDocument();
  // Every toolbar but the hero's chip.
  const strips = screen
    .getAllByRole("toolbar")
    .filter((bar) => bar.getAttribute("data-action-bar") !== "chip");
  expect(strips).toHaveLength(4);
  for (const strip of strips) {
    expect(strip).toHaveAttribute("data-action-bar", "strip");
    expect(
      [...strip.querySelectorAll("[data-action]")].map((b) => b.getAttribute("data-action")),
    ).toEqual(["more", "edit"]);
  }
  expect(screen.getByRole("toolbar", { name: "l’entrée de 2007" })).toBeInTheDocument();
});

/** #419: the entry is edited in the side panel, on this page, like every block. */
test("✎ opens the entry in the side panel, on the page itself", async () => {
  const user = userEvent.setup();
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  setMockUser("demo.direction");
  const { router } = await renderWithSession(<History />, { route: "/history" });
  await screen.findByTestId("history-timeline");
  await user.click(
    screen.getByRole("button", { name: "Modifier l’entrée de 2007 (sans allemand)" }),
  );
  expect(await screen.findByRole("dialog", { name: /Histoire · l’entrée de 2007/ })).toBeVisible();
  expect(await screen.findByLabelText("Texte en français")).toHaveValue(
    "Dès la saison 2007/2008, les Directeurs (tous d’anciens Canetons) se sont succédé.",
  );
  expect(router.state.location.pathname).toBe("/history");
});

test("deleting an entry removes it after the confirmation", async () => {
  const user = userEvent.setup();
  await renderHistory("fr", "demo.direction");
  await chooseDelete(user, "Le flambeau passe");
  await user.click(await screen.findByRole("button", { name: "Supprimer" }));
  await expect.poll(() => screen.queryByText("Le flambeau passe")).toBeNull();
});

const untitled = (id: number, occurredOn: string, precision: string): HistoryEntryResource => ({
  id,
  occurredOn,
  precision,
  important: false,
  icon: null,
  titleFr: null,
  bodyFr: "Texte",
  titleDe: null,
  bodyDe: "Text",
  createdAt: "2026-09-26T00:00:00+00:00",
  updatedAt: "2026-09-26T00:00:00+00:00",
});

function serveOnly(...rows: ReturnType<typeof untitled>[]) {
  server.use(
    http.get("/api/v1/history", () =>
      HttpResponse.json({ data: rows, meta: { total: rows.length, limit: 500, offset: 0 } }),
    ),
  );
}

/**
 * An untitled entry is named by its date, in the right French and German
 * ("d’octobre", "du 11.11.2023", "vom 11.11.2023"), so untitled rows do not
 * get identical buttons.
 */
test("an untitled entry's buttons and dialog use the right French for its date", async () => {
  serveOnly(untitled(1, "2002-10-01", "month"), untitled(2, "2023-11-11", "day"));
  const user = userEvent.setup();
  await renderHistory("fr", "demo.direction");
  await chooseDelete(user, "l’entrée d’octobre 2002");
  expect(
    await screen.findByRole("alertdialog", { name: "Supprimer l’entrée d’octobre 2002 ?" }),
  ).toBeInTheDocument();
  await user.keyboard("{Escape}");
  await chooseDelete(user, "l’entrée du 11.11.2023");
  expect(
    await screen.findByRole("alertdialog", { name: "Supprimer l’entrée du 11.11.2023 ?" }),
  ).toBeInTheDocument();
});

test("the German dialog says vom for an exact date", async () => {
  serveOnly(untitled(2, "2023-11-11", "day"));
  const user = userEvent.setup();
  await renderHistory("de-CH", "demo.direction");
  await user.click(
    screen.getByRole("button", { name: "Weitere Aktionen: den Eintrag vom 11.11.2023" }),
  );
  await user.click(await screen.findByRole("menuitem", { name: "Löschen" }));
  expect(
    await screen.findByRole("alertdialog", { name: "Den Eintrag vom 11.11.2023 löschen?" }),
  ).toBeInTheDocument();
});

/** Non-breaking spaces, so the guillemets and the question mark never start a line. */
test("the French dialog title keeps its guillemets and question mark attached", async () => {
  const user = userEvent.setup();
  await renderHistory("fr", "demo.direction");
  await chooseDelete(user, "Le flambeau passe");
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByRole("heading").textContent).toBe(
    "Supprimer « Le flambeau passe » (2026) ?",
  );
});

test("a delete says so", async () => {
  const user = userEvent.setup();
  await renderHistory("fr", "demo.direction");
  await chooseDelete(user, "Le flambeau passe");
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  await expect.poll(() => screen.getByRole("status").textContent).toBe("Entrée supprimée.");
});

/** No photo carries alt text, so the image is named after the entry. */
test("an entry with a photo shows it named after the entry, and the others show no image", async () => {
  const timeline = await renderHistory();
  // The photo is its slot's, which arrives with the photo slots.
  expect(
    await within(timeline).findByRole("img", { name: "Le flambeau passe" }),
  ).toBeInTheDocument();
  expect(within(timeline).getAllByRole("img")).toHaveLength(1);
});

test("an editor outside edit mode sees the timeline and none of its controls", async () => {
  await renderHistory("fr", "demo.direction", false);
  expect(screen.queryByRole("button", { name: /Ajouter/ })).toBeNull();
  expect(screen.queryByRole("toolbar")).toBeNull();
});
