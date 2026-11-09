import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeAll, beforeEach, expect, test, vi } from "vitest";

import { setMockUser } from "../../mocks/handlers";
import { server } from "../../mocks/node";
import { recordBlockPuts } from "../../test/renderBlockEditor";
import { renderWithSession } from "../../test/renderWithSession";
import { CardsBlock } from "../blocks/CardsBlock";
import { HeroBlock } from "../blocks/HeroBlock";
import { EDIT_MODE_KEY } from "../EditMode";
import { BLOCKS } from "../registry";

/*
 * The page is the preview (#357): while a block's editor is open, the page
 * shows what is typed, and nothing reaches the server before the save.
 */

const shipped = BLOCKS["join.hero"].defaults();
const heading = () => screen.getByRole("heading", { level: 1 });

beforeEach(() => {
  setMockUser("demo.direction");
  sessionStorage.setItem(EDIT_MODE_KEY, "1");
});

afterEach(() => server.events.removeAllListeners());

// Radix sizes a radio's hidden form input with ResizeObserver, which jsdom
// lacks; the card editor has radios.
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

async function openHeroEditor() {
  const user = userEvent.setup();
  await renderWithSession(<HeroBlock blockKey="join.hero" seed={5} />, { route: "/join" });
  await user.click(screen.getByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog, title: within(dialog).getByRole("textbox", { name: "Titre FR" }) };
}

test("typing in the editor changes the page before anything is saved", async () => {
  const puts = recordBlockPuts();
  const { user, title } = await openHeroEditor();

  await user.clear(title);
  await user.type(title, "Viens jouer");

  expect(heading().textContent).toBe("Viens jouer");
  expect(puts).toEqual([]);
});

test("an emptied required text keeps the page on the last value it accepted", async () => {
  const { user, title } = await openHeroEditor();

  await user.clear(title);
  await user.type(title, "Viens");
  await user.clear(title);

  expect(heading().textContent).toBe("Viens");
});

test("discarding the edit puts the page back as it was", async () => {
  const { user, dialog, title } = await openHeroEditor();
  await user.type(title, " vite");
  expect(heading().textContent).toBe(`${shipped.title.fr} vite`);

  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
  await user.click(await screen.findByRole("button", { name: "Abandonner" }));

  expect(screen.queryByRole("dialog")).toBeNull();
  expect(heading().textContent).toBe(shipped.title.fr);
});

test("the page shows no edit chip while an editor is open, and gets them back after", async () => {
  const { user, dialog } = await openHeroEditor();

  expect(screen.queryAllByRole("button", { name: /^Modifier : / })).toEqual([]);

  await user.click(within(dialog).getByRole("button", { name: "Annuler" }));
  expect(
    await screen.findByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }),
  ).toBeInTheDocument();
});

test("Aperçu lowers the editor to a bar that can still save", async () => {
  const puts = recordBlockPuts();
  const { user, dialog, title } = await openHeroEditor();
  await user.clear(title);
  await user.type(title, "Viens jouer");

  await user.click(within(dialog).getByRole("button", { name: "Aperçu" }));

  expect(within(dialog).queryByRole("textbox", { name: "Titre FR" })).toBeNull();
  const bar = within(dialog).getByRole("group", { name: "En-tête" });
  expect(within(bar).getByRole("button", { name: "Modifier" })).toHaveFocus();
  await user.click(within(bar).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts.map((put) => put.key)).toEqual(["join.hero"]);
});

test("Modifier in the bar brings the form back with what was typed", async () => {
  const { user, dialog, title } = await openHeroEditor();
  await user.clear(title);
  await user.type(title, "Viens jouer");
  await user.click(within(dialog).getByRole("button", { name: "Aperçu" }));

  await user.click(within(dialog).getByRole("button", { name: "Modifier" }));

  expect(within(dialog).getByRole("textbox", { name: "Titre FR" })).toHaveValue("Viens jouer");
});

test("the editor names the block's page above the block itself", async () => {
  const { dialog } = await openHeroEditor();

  expect(within(dialog).getByRole("heading", { name: "En-tête" })).toBeInTheDocument();
  expect(within(dialog).getByText("Nous rejoindre")).toBeInTheDocument();
});

test("a card's editor is titled by the card", async () => {
  const user = userEvent.setup();
  const card = BLOCKS["join.facts"].defaults().cards[0]!;
  await renderWithSession(<CardsBlock blockKey="join.facts" />, { route: "/join" });

  await user.click(screen.getByRole("button", { name: `Modifier : ${card.title.fr}` }));
  const dialog = await screen.findByRole("dialog");

  expect(within(dialog).getByRole("heading", { name: card.title.fr })).toBeInTheDocument();
  // The place stands above the card, and names the dialog as before.
  expect(dialog).toHaveAccessibleName("Nous rejoindre · cartes");
});

test("a button in the list is titled by its own label once it has one", async () => {
  const { user, dialog } = await openHeroEditor();

  await user.click(within(dialog).getByRole("button", { name: "Ajouter un bouton" }));
  const item = within(dialog).getByRole("listitem");
  expect(item.firstElementChild).toHaveTextContent("Bouton 1");

  await user.type(within(item).getByRole("textbox", { name: "Libellé FR" }), "Rejoins-nous");

  expect(item.firstElementChild).toHaveTextContent("Rejoins-nous");
});
