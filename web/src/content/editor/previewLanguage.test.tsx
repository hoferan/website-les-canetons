import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, expect, test, vi } from "vitest";

import { setMockUser } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { AppRoutes } from "../../routes";
import { cardPencil } from "../../test/cardControls";
import { recordBlockPuts } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { EDIT_MODE_KEY } from "../EditMode";

// jsdom has no ResizeObserver, which the card editor's radios need.
beforeAll(() => {
  vi.stubGlobal(
    "ResizeObserver",
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
});
afterAll(() => vi.unstubAllGlobals());
afterEach(() => {
  server.events.removeAllListeners();
  sessionStorage.clear();
  vi.restoreAllMocks();
});

/**
 * The editor's FR | DE (#368): the page, its preview, moves to the other
 * language and the edit carries on, typed values and all.
 */
async function editThenSwitch(chip: string | RegExp, field: string, typed: string) {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
  const { router } = await renderWithSession(<AppRoutes />, { route: "/join" });

  await user.click((await screen.findAllByRole("button", { name: chip }))[0]!);
  const dialog = await screen.findByRole("dialog");
  const french = within(dialog).getByRole("textbox", { name: `${field} FR` });
  await user.clear(french);
  await user.type(french, typed);

  await user.click(within(dialog).getByRole("link", { name: "Aperçu en allemand" }));

  return { user, router, dialog: screen.getByRole("dialog") };
}

test("the hero's edit carries over to the German page, and saves from there", async () => {
  const confirm = vi.spyOn(window, "confirm");
  const puts = recordBlockPuts();
  const { user, router, dialog } = await editThenSwitch(
    "Modifier : Nous rejoindre · en-tête",
    "Titre",
    "Viens jouer",
  );

  expect(router.state.location.pathname).toBe("/de/join");
  expect(confirm).not.toHaveBeenCalled();
  // The editor speaks German now, and still holds what was typed.
  expect(within(dialog).getByRole("textbox", { name: "Titel FR" })).toHaveValue("Viens jouer");
  // The current language is marked, and stays a link that goes nowhere new.
  expect(within(dialog).getByRole("link", { name: "Vorschau auf Deutsch" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  // The page is the preview, in German.
  const german = within(dialog).getByRole("textbox", { name: "Titel DE" });
  await user.clear(german);
  await user.type(german, "Komm spielen");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Komm spielen");

  await user.click(within(dialog).getByRole("button", { name: "Speichern" }));

  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]).toMatchObject({
    key: "join.hero",
    body: { data: { title: { fr: "Viens jouer", de: "Komm spielen" } } },
  });
});

test("a card's edit carries over to the German page, and saves from there", async () => {
  const puts = recordBlockPuts();
  const { user, dialog } = await editThenSwitch(
    cardPencil("Instruments recherchés"),
    "Titre",
    "Instruments",
  );

  expect(within(dialog).getByRole("textbox", { name: "Titel FR" })).toHaveValue("Instruments");
  await user.click(within(dialog).getByRole("button", { name: "Speichern" }));

  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.key).toBe("join.facts");
  const { cards } = (puts[0]?.body as { data: { cards: { id: string; title: unknown }[] } }).data;
  expect(cards.find((card) => card.id === "instruments")?.title).toMatchObject({
    fr: "Instruments",
  });
});

test("the footer's edit carries over to the German page, and saves from there", async () => {
  const puts = recordBlockPuts();
  const { user, dialog } = await editThenSwitch(
    "Modifier les infos du site",
    "Phrase sous le nom",
    "La guggen des enfants",
  );

  expect(within(dialog).getByRole("textbox", { name: "Satz unter dem Namen FR" })).toHaveValue(
    "La guggen des enfants",
  );
  await user.click(within(dialog).getByRole("button", { name: "Speichern" }));

  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]).toMatchObject({
    key: "site",
    body: { data: { pitch: { fr: "La guggen des enfants" } } },
  });
});

test("FR goes back, with the edit still there", async () => {
  const { user, router, dialog } = await editThenSwitch(
    "Modifier : Nous rejoindre · en-tête",
    "Titre",
    "Viens jouer",
  );

  await user.click(within(dialog).getByRole("link", { name: "Vorschau auf Französisch" }));

  expect(router.state.location.pathname).toBe("/join");
  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue("Viens jouer");
  expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Viens jouer");
});
