import { fireEvent, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { server } from "../../mocks/node";
import { recordBlockPuts, renderBlockEditor, storeBlock } from "../../test/renderBlockEditor";
import { TranslatedField } from "./TranslatedField";

afterEach(() => server.events.removeAllListeners());

const FR = "Viens jouer, pas besoin de lire la musique, le samedi matin.";
const DE = "Komm spielen, am Samstagvormittag.";

async function open() {
  storeBlock("home.hero", { title: { fr: "Les Canetons" }, intro: { fr: FR, de: DE } });
  const dialog = await renderBlockEditor("home.hero", () => (
    <>
      <TranslatedField name="title" label="Titre" />
      <TranslatedField name="intro" label="Introduction" multiline />
    </>
  ));
  const french = within(dialog).getByRole("textbox", { name: "Introduction FR" });
  return { dialog, french: french as HTMLTextAreaElement, user: userEvent.setup() };
}

/** Selects the first occurrence of `words`, as a pointer or the keyboard would. */
function select(area: HTMLTextAreaElement, words: string) {
  const at = area.value.indexOf(words);
  area.focus();
  area.setSelectionRange(at, at + words.length);
  fireEvent.select(area);
}

const barOf = (area: HTMLElement) =>
  within(area.parentElement as HTMLElement).getByRole("group", { name: "Mise en forme" });

test("each longer text gets the bar in both languages, a title none", async () => {
  const { dialog, french } = await open();

  const german = within(dialog).getByRole("textbox", { name: "Introduction DE" });
  for (const area of [french, german]) {
    const bar = barOf(area);
    expect(within(bar).getByRole("button", { name: "Gras" })).toBeVisible();
    expect(within(bar).getByRole("button", { name: "Italique" })).toBeVisible();
  }
  expect(within(dialog).getAllByRole("group", { name: "Mise en forme" })).toHaveLength(2);
});

test("Gras sets the selected words in bold, and a second tap takes it off", async () => {
  const { french, user } = await open();
  const bold = within(barOf(french)).getByRole("button", { name: "Gras" });
  expect(bold).toHaveAttribute("aria-pressed", "false");

  select(french, "pas besoin");
  await user.click(bold);

  expect(french.value).toBe("Viens jouer, **pas besoin** de lire la musique, le samedi matin.");
  expect(french).toHaveFocus();
  expect(french.value.slice(french.selectionStart, french.selectionEnd)).toBe("pas besoin");
  expect(bold).toHaveAttribute("aria-pressed", "true");

  await user.click(bold);
  expect(french.value).toBe(FR);
  expect(bold).toHaveAttribute("aria-pressed", "false");
});

test("Ctrl+I sets the selected words in italic", async () => {
  const { french, user } = await open();

  select(french, "samedi matin");
  await user.keyboard("{Control>}i{/Control}");

  expect(french.value).toBe("Viens jouer, pas besoin de lire la musique, le *samedi matin*.");
  expect(within(barOf(french)).getByRole("button", { name: "Italique" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
});

test("the bold words are saved with their stars, and the German as it was", async () => {
  const puts = recordBlockPuts();
  const { dialog, french, user } = await open();

  select(french, "jouer");
  await user.click(within(barOf(french)).getByRole("button", { name: "Gras" }));
  await user.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => puts.length).toBe(1);
  const data = (puts[0]?.body as { data: { intro: { fr: string; de?: string } } }).data;
  expect(data.intro).toEqual({
    fr: "Viens **jouer**, pas besoin de lire la musique, le samedi matin.",
    de: DE,
  });
});
