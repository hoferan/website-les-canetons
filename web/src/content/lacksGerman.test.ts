import { expect, test } from "vitest";

import { lacksGerman } from "./translated";

test("a text with French and no German, or a blank one, lacks German", () => {
  expect(lacksGerman({ fr: "Werkhof" })).toBe(true);
  expect(lacksGerman({ fr: "Werkhof", de: "  " })).toBe(true);
  expect(lacksGerman({ fr: "Werkhof", de: "Werkhof" })).toBe(false);
  // Nothing in French either: nothing shows on either page.
  expect(lacksGerman({ fr: "" })).toBe(false);
});

test("it finds such a text anywhere in a block, in lists and rows", () => {
  const card = {
    id: "place",
    tint: "lime",
    title: { fr: "Lieu", de: "Ort" },
    rows: [
      { type: "map", label: { fr: "Werkhof" }, query: "Werkhof, Fribourg" },
      { type: "text", text: { fr: "Basse-Ville", de: "Unterstadt" } },
    ],
  };
  expect(lacksGerman(card)).toBe(true);
  expect(lacksGerman({ ...card, rows: [card.rows[1]] })).toBe(false);
  // Numbers, links and ids are not texts.
  expect(lacksGerman({ number: "026 123 45 67", to: "/join", id: "x" })).toBe(false);
});

test("a hero's highlight is not a text of its own", () => {
  // Without a German mark the German page lights nothing, which "Aucun" sets on purpose.
  expect(
    lacksGerman({
      title: { fr: "Nos Canetons", de: "Unsere Canetons" },
      mark: { fr: "Canetons" },
    }),
  ).toBe(false);
});
