import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { server } from "../../mocks/node";
import { recordBlockPuts, renderBlockEditor, storeBlock } from "../../test/renderBlockEditor";
import { tr } from "../translated";
import { BLOCKS } from "../registry";
import { ListField, MAX_ITEMS } from "./ListField";
import { TranslatedField } from "./TranslatedField";

afterEach(() => server.events.removeAllListeners());

const shipped = BLOCKS["join.facts"].defaults().cards;

function cardFields() {
  return (
    <ListField
      name="cards"
      addLabel="Ajouter une carte"
      newItem={() => ({
        id: "new",
        icon: "star",
        tint: "pink",
        title: { fr: "" },
        rows: [],
      })}
      renderItem={(index) => <TranslatedField name={`cards.${index}.title`} label="Titre" />}
    />
  );
}

/** The French titles in the order the list shows them. */
function titles(dialog: HTMLElement): string[] {
  return within(dialog)
    .getAllByRole("textbox", { name: "Titre FR" })
    .map((input) => (input as HTMLInputElement).value);
}

const items = (dialog: HTMLElement) => within(dialog).getAllByRole("listitem");

test("list items move up and down and can be removed", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("join.facts", cardFields);
  const [first, second, third] = shipped.map((card) => tr(card.title));

  expect(titles(dialog).slice(0, 3)).toEqual([first, second, third]);

  const down = within(items(dialog)[0]!).getByRole("button", { name: "Descendre" });
  await user.click(down);
  expect(titles(dialog).slice(0, 3)).toEqual([second, first, third]);
  // Focus follows the card it moved.
  expect(within(items(dialog)[1]!).getByRole("button", { name: "Descendre" })).toHaveFocus();

  await user.click(within(items(dialog)[2]!).getByRole("button", { name: "Monter" }));
  expect(titles(dialog).slice(0, 3)).toEqual([second, third, first]);

  await user.click(within(items(dialog)[0]!).getByRole("button", { name: "Supprimer" }));
  expect(titles(dialog)).toHaveLength(shipped.length - 1);
  expect(titles(dialog)[0]).toBe(third);
  // Focus lands on the card that took the removed one's place.
  expect(within(items(dialog)[0]!).getByRole("button", { name: "Supprimer" })).toHaveFocus();

  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));
  await expect.poll(() => puts.length).toBe(1);
  const saved = (puts[0]?.body as { data: { cards: { id: string }[] } }).data.cards;
  // The cards keep their own ids through the moves.
  expect(saved.map((card) => card.id)).toEqual([
    shipped[2]!.id,
    shipped[0]!.id,
    ...shipped.slice(3).map((card) => card.id),
  ]);
});

test("the first item cannot go up nor the last one down", async () => {
  const dialog = await renderBlockEditor("join.facts", cardFields);
  const all = items(dialog);

  expect(within(all[0]!).getByRole("button", { name: "Monter" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
  expect(within(all.at(-1)!).getByRole("button", { name: "Descendre" })).toHaveAttribute(
    "aria-disabled",
    "true",
  );
});

test("an item is added at the end, and adding stops at the server's limit", async () => {
  const user = userEvent.setup();
  const card = shipped[0]!;
  storeBlock("join.facts", {
    cards: Array.from({ length: MAX_ITEMS - 1 }, (_, index) => ({ ...card, id: `card-${index}` })),
  });
  const dialog = await renderBlockEditor("join.facts", cardFields);

  await user.click(within(dialog).getByRole("button", { name: "Ajouter une carte" }));

  expect(items(dialog)).toHaveLength(MAX_ITEMS);
  expect(titles(dialog).at(-1)).toBe("");
  expect(within(dialog).queryByRole("button", { name: "Ajouter une carte" })).toBeNull();
  expect(screen.getByRole("dialog")).toBe(dialog);
});
