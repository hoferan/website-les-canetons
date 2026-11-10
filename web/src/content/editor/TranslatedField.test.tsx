import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { server } from "../../mocks/node";
import { recordBlockPuts, renderBlockEditor } from "../../test/renderBlockEditor";
import { TranslatedField } from "./TranslatedField";

afterEach(() => server.events.removeAllListeners());

type Label = Record<string, unknown>;

/** The place card's place name, which ships with no German. */
const PLACE = "cards.3.rows.0.label";

test("+ Deutsch reveals the German field and saving keeps German blank when left empty", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("join.facts", () => (
    <TranslatedField name={PLACE} label="Lieu" />
  ));

  const french = within(dialog).getByRole("textbox", { name: "Lieu FR" });
  expect(french).toHaveValue("Werkhof");
  expect(within(dialog).queryByRole("textbox", { name: "Lieu DE" })).toBeNull();

  await user.click(within(dialog).getByRole("button", { name: "+ Deutsch" }));
  const german = within(dialog).getByRole("textbox", { name: "Lieu DE" });
  expect(german).toHaveFocus();
  expect(german).toHaveValue("");
  // Typed in, then emptied again: still nothing to store.
  await user.type(german, "Werkhof");
  await user.clear(german);
  expect(within(dialog).getByRole("textbox", { name: "Lieu DE" })).toHaveFocus();

  await user.clear(french);
  await user.type(french, "Werkhof Marly");
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts.length).toBe(1);
  const data = (puts[0]?.body as { data: { cards: { rows: { label: Label }[] }[] } }).data;
  const label = data.cards[3]?.rows[0]?.label;
  // No `de` at all, not an empty one: the German page then shows the French.
  expect(label).toEqual({ fr: "Werkhof Marly" });
  expect(Object.keys(label ?? {})).toEqual(["fr"]);
});

// On the German page the editor is there to write German (#368).
test("on the German page every German field is open, and Retirer l'allemand still closes one", async () => {
  const user = userEvent.setup();
  const dialog = await renderBlockEditor(
    "join.facts",
    () => <TranslatedField name={PLACE} label="Ort" />,
    { locale: "de-CH" },
  );

  // The place name ships with no German, and its field is open all the same.
  const german = within(dialog).getByRole("textbox", { name: "Ort DE" });
  expect(german).toHaveValue("");

  await user.click(within(dialog).getByRole("button", { name: "Deutsch entfernen" }));

  expect(within(dialog).queryByRole("textbox", { name: "Ort DE" })).toBeNull();
  expect(within(dialog).getByRole("button", { name: "+ Deutsch" })).toHaveFocus();
});

test("a German text already set shows its field, and Retirer l'allemand drops it", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("join.facts", () => (
    <TranslatedField name="cards.0.title" label="Titre" />
  ));

  const german = within(dialog).getByRole("textbox", { name: "Titre DE" });
  expect(german).not.toHaveValue("");

  await user.click(within(dialog).getByRole("button", { name: "Retirer l’allemand" }));
  expect(within(dialog).queryByRole("textbox", { name: "Titre DE" })).toBeNull();
  expect(within(dialog).getByRole("button", { name: "+ Deutsch" })).toHaveFocus();

  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts.length).toBe(1);
  const data = (puts[0]?.body as { data: { cards: { title: Label }[] } }).data;
  expect(Object.keys(data.cards[0]?.title ?? {})).toEqual(["fr"]);
});

test("a multiline field grows with its content", async () => {
  const user = userEvent.setup();
  const dialog = await renderBlockEditor("home.hero", () => (
    <TranslatedField name="intro" label="Introduction" multiline />
  ));

  const french = within(dialog).getByRole("textbox", { name: "Introduction FR" });
  expect(french.tagName).toBe("TEXTAREA");
  await user.clear(french);
  // Three rows at the least, so an empty paragraph still looks like one.
  expect(french).toHaveAttribute("rows", "3");

  await user.type(french, "un{Enter}deux{Enter}trois{Enter}quatre{Enter}cinq");
  expect(french).toHaveAttribute("rows", "5");
  expect(screen.getByRole("dialog")).toBe(dialog);
});

test("an optional text emptied in both languages stays empty on screen and is not stored", async () => {
  const user = userEvent.setup();
  const puts = recordBlockPuts();
  const dialog = await renderBlockEditor("join.hero", () => (
    <TranslatedField name="intro" label="Introduction" multiline />
  ));

  const french = within(dialog).getByRole("textbox", { name: "Introduction FR" });
  expect(french).not.toHaveValue("");
  await user.click(within(dialog).getByRole("button", { name: "Retirer l’allemand" }));
  await user.clear(french);
  // Not back to the value the form opened with.
  expect(within(dialog).getByRole("textbox", { name: "Introduction FR" })).toHaveValue("");

  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts.length).toBe(1);
  expect(puts[0]?.body as { data: Record<string, unknown> }).not.toHaveProperty("data.intro");
});

test("Retirer l'allemand is a clear button inside the German field, and the only one", async () => {
  const user = userEvent.setup();
  const dialog = await renderBlockEditor("join.facts", () => (
    <TranslatedField name="cards.0.title" label="Titre" />
  ));

  const german = within(dialog).getByRole("textbox", { name: "Titre DE" });
  const clear = within(german.parentElement as HTMLElement).getByRole("button", {
    name: "Retirer l’allemand",
  });
  // An icon, not a text button under the field.
  expect(within(dialog).queryByText("Retirer l’allemand")).toBeNull();
  expect(within(dialog).getAllByRole("button", { name: "Retirer l’allemand" })).toEqual([clear]);

  await user.click(clear);
  expect(within(dialog).queryByRole("textbox", { name: "Titre DE" })).toBeNull();
});
