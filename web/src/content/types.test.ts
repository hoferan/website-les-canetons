import { expect, test } from "vitest";

import { forEditor, isPhoneNumber } from "./types";

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
