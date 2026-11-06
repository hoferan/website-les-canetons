import { expect, test } from "vitest";

import { card, forEditor, heroBlock, isPhoneNumber } from "./types";

test.each(["+41 (0)26 123 45 67", "026 123 45 67", "0041 26 123 45 67", "+41 26 123 45 67", ""])(
  "the editor accepts %j",
  (number) => {
    expect(isPhoneNumber(number)).toBe(true);
  },
);

// No leading +, 00 or 0: dialled as typed, these reach another country.
test.each(["26 123 45 67", "79 123 45 67", "à demander", "026 123 45 6", "+41 79 123+45 67"])(
  "the editor refuses %j",
  (number) => {
    expect(isPhoneNumber(number)).toBe(false);
  },
);

test("a phone row with a number that cannot be dialled does not save", () => {
  const row = { type: "phone", label: { fr: "Contact" }, number: "79 123 45 67" };

  expect(forEditor.row.safeParse(row).success).toBe(false);
  expect(forEditor.row.safeParse({ ...row, number: "079 123 45 67" }).success).toBe(true);
});

const heroWith = (to: string) => ({
  title: { fr: "Titre" },
  actions: [{ label: { fr: "Go" }, to }],
});

test.each(["/join", "/agenda", "https://www.example.ch/page"])(
  "a hero button may lead to %s",
  (to) => {
    expect(forEditor.heroBlock.safeParse(heroWith(to)).success).toBe(true);
  },
);

// Anything else would become an href or a router target as typed.
test.each([
  "javascript:alert(1)",
  "http://example.ch",
  "join",
  "//evil.example",
  "/members",
  "https://",
  "",
])("a hero button may not lead to %j", (to) => {
  expect(forEditor.heroBlock.safeParse(heroWith(to)).success).toBe(false);
});

test("a hero carries at most two buttons, and none by default", () => {
  const action = { label: { fr: "Go" }, to: "/join" };

  expect(heroBlock.safeParse({ title: { fr: "Titre" } }).success).toBe(true);
  expect(heroBlock.safeParse({ title: { fr: "Titre" }, actions: [action, action] }).success).toBe(
    true,
  );
  expect(
    heroBlock.safeParse({ title: { fr: "Titre" }, actions: [action, action, action] }).success,
  ).toBe(false);
});

const plainCard = { id: "c", tint: "pink", title: { fr: "Parrains" }, rows: [] };

test("a card reads with or without an icon, and refuses an unknown one", () => {
  expect(card.parse(plainCard)).not.toHaveProperty("icon");
  expect(card.parse({ ...plainCard, icon: "star" })).toHaveProperty("icon", "star");
  expect(card.safeParse({ ...plainCard, icon: "dragon" }).success).toBe(false);
});

test("the editor saves the picker's 'no icon' as an absent icon, keeping the colour", () => {
  const saved = forEditor.card.parse({ ...plainCard, icon: "" });

  // Undefined, so the saved JSON carries no icon at all.
  expect(saved.icon).toBeUndefined();
  expect(JSON.parse(JSON.stringify(saved))).not.toHaveProperty("icon");
  expect(saved).toHaveProperty("tint", "pink");
  expect(forEditor.card.parse({ ...plainCard, icon: "star" })).toHaveProperty("icon", "star");
});
