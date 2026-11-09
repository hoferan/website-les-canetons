import { expect, test } from "vitest";

import { fadeAround, shadowOffset } from "./fadeAround";

test("a card's hard shadow is read from its computed box-shadow", () => {
  expect(shadowOffset("rgb(20, 18, 28) 6px 6px 0px 0px")).toEqual({ x: 6, y: 6 });
});

test("only the first of several shadows counts", () => {
  expect(
    shadowOffset("rgba(0, 0, 0, 0.1) 4px 8px 0px 0px, rgb(0, 0, 0) 12px 12px 0px 0px"),
  ).toEqual({
    x: 4,
    y: 8,
  });
});

test("no shadow, or an inset one, takes no room outside the block", () => {
  expect(shadowOffset("none")).toEqual({ x: 0, y: 0 });
  expect(shadowOffset("rgb(0, 0, 0) 3px 5px 0px 0px inset")).toEqual({ x: 0, y: 0 });
});

test("the fade is laid outside the page and taken away again", () => {
  const block = document.createElement("section");
  document.body.appendChild(block);

  const unfade = fadeAround(block, () => false);
  expect(document.querySelectorAll("body > [data-edit-fade]")).toHaveLength(1);

  unfade();
  expect(document.querySelector("[data-edit-fade]")).toBeNull();
  block.remove();
});
