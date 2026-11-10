import { expect, test } from "vitest";

import { BLOCKS, type BlockKey } from "./registry";
import { fromCatalogue } from "./translated";

test("every default parses under its own schema", () => {
  // useBlock would swap such a default for itself, so the page would still
  // render, but an editor opened on it would refuse to save the shipped
  // content.
  for (const key of Object.keys(BLOCKS) as BlockKey[]) {
    const block = BLOCKS[key];
    const parsed = block.schema.safeParse(block.defaults());
    expect(parsed.error, key).toBeUndefined();
  }
});

test("every default passes its editor's checks", () => {
  // Otherwise "Rétablir l'original" fills in content the editor refuses.
  for (const key of Object.keys(BLOCKS) as BlockKey[]) {
    const block = BLOCKS[key];
    const parsed = (block.editSchema ?? block.schema).safeParse(block.defaults());
    expect(parsed.error, key).toBeUndefined();
  }
});

test("the registry holds every block a page shows", () => {
  expect(Object.keys(BLOCKS).sort()).toEqual(
    [
      "site",
      "home.hero",
      "home.cards",
      "join.hero",
      "join.facts",
      "committee.hero",
      "committee.contact",
      "band.hero",
      "band.godparents",
      "history.hero",
      "contact.hero",
      "agenda.hero",
    ].sort(),
  );
});

test("a catalogue text keeps its German even when it reads the same as the French", () => {
  // "Werkhof" is Werkhof in both languages, and has its German all the same,
  // so a shipped text never wears the "sans allemand" dot.
  expect(fromCatalogue("join.locationPlace")).toEqual({ fr: "Werkhof", de: "Werkhof" });
  expect(fromCatalogue("join.location")).toEqual({ fr: "Lieu", de: "Ort" });
});

test("the join hero default carries its highlight", () => {
  // The highlighted words are part of the hero as shipped, so the default
  // must carry them, or the page loses its yellow mark once it reads blocks.
  expect(BLOCKS["join.hero"].defaults().mark).toEqual({ fr: "la guggen", de: "Gugge" });
});

test("every hero with a highlight on its page ships it, and contact has none", () => {
  const marked: BlockKey[] = [
    "home.hero",
    "join.hero",
    "committee.hero",
    "band.hero",
    "history.hero",
    "agenda.hero",
  ];
  for (const key of marked) {
    expect((BLOCKS[key].defaults() as { mark?: unknown }).mark, key).toBeDefined();
  }
  expect(BLOCKS["contact.hero"].defaults().mark).toBeUndefined();
});

test("every hero with a German title ships its German highlight explicitly", () => {
  // The German page takes its highlight from the German mark alone once the
  // title has a German wording, so a German mark the same as the French one
  // must still be stored, or "Canetons" goes dark on /de/band.
  for (const key of Object.keys(BLOCKS) as BlockKey[]) {
    const hero = BLOCKS[key].defaults() as { title?: { de?: string }; mark?: { de?: string } };
    if (hero.title?.de === undefined || hero.mark === undefined) continue;
    expect(hero.mark.de, key).toBeTruthy();
  }
  expect(BLOCKS["band.hero"].defaults().mark).toEqual({ fr: "Canetons", de: "Canetons" });
});

test("the joining contacts ship as two empty phone rows", () => {
  const contacts = BLOCKS["join.facts"].defaults().cards.find((card) => card.id === "contacts");

  expect(contacts?.rows).toEqual([
    { type: "phone", label: { fr: "" }, number: "", tbd: "join-contact" },
    { type: "phone", label: { fr: "" }, number: "", tbd: "join-contact" },
  ]);
});
