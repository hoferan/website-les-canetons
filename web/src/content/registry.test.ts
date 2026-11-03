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

test("the registry holds every block a page shows", () => {
  expect(Object.keys(BLOCKS).sort()).toEqual(
    [
      "site",
      "home.hero",
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

test("a catalogue text the same in both languages is stored without German", () => {
  // A name or a place reads the same on both pages, so the editor opens on
  // one field rather than two copies of it.
  expect(fromCatalogue("join.locationPlace")).toEqual({ fr: "Werkhof" });
  expect(fromCatalogue("join.location")).toEqual({ fr: "Lieu", de: "Ort" });
});

test("the joining contacts ship as two empty phone rows", () => {
  const contacts = BLOCKS["join.facts"].defaults().cards.find((card) => card.id === "contacts");

  expect(contacts?.rows).toEqual([
    { type: "phone", label: { fr: "" }, number: "", tbd: "join-contact" },
    { type: "phone", label: { fr: "" }, number: "", tbd: "join-contact" },
  ]);
});
