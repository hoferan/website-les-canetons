import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { Avatar, initials } from "./Avatar";

test.each([
  ["Dominique", "Direction", "DD"],
  ["élodie", "de Weck", "ÉD"],
  ["  Nadia ", "Sansconnexion", "NS"],
  ["Cher", "", "C"],
  ["", "", ""],
])("initials(%j, %j) is %j", (first, last, expected) => {
  expect(initials(first, last)).toBe(expected);
});

test("falls back to an icon when there are no initials", () => {
  const { container } = render(<Avatar firstName="" lastName="" />);
  expect(container.querySelector("svg")).not.toBeNull();
  expect(container.textContent).toBe("");
});
