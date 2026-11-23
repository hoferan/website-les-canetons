import { expect, test } from "vitest";

import { toggleStyle } from "./toggleStyle";

test("wraps the selection", () => {
  expect(toggleStyle("et pas besoin", 3, 13, "bold")).toEqual({
    value: "et **pas besoin**",
    start: 5,
    end: 15,
  });
});

test("unwraps a selection that is bold", () => {
  expect(toggleStyle("et **pas besoin**", 5, 15, "bold")).toEqual({
    value: "et pas besoin",
    start: 3,
    end: 13,
  });
});

test("unwraps when the stars are selected too", () => {
  expect(toggleStyle("et **pas**", 3, 10, "bold").value).toBe("et pas");
});

test("the caret inside bold unwraps it", () => {
  expect(toggleStyle("a **bc** d", 5, 5, "bold")).toEqual({ value: "a bc d", start: 3, end: 3 });
});

test("the caret elsewhere inserts an empty pair", () => {
  expect(toggleStyle("ab", 1, 1, "italic")).toEqual({ value: "a**b", start: 2, end: 2 });
  expect(toggleStyle("ab", 1, 1, "bold")).toEqual({ value: "a****b", start: 3, end: 3 });
});

test("trims spaces off the selection", () => {
  expect(toggleStyle("la musique : les", 3, 11, "bold")).toEqual({
    value: "la **musique** : les",
    start: 5,
    end: 12,
  });
});

test("a selection of spaces only inserts an empty pair at its start", () => {
  expect(toggleStyle("a  b", 1, 3, "italic").value).toBe("a**  b");
});

test("wraps each line of a selection on its own", () => {
  expect(toggleStyle("un\ndeux", 0, 7, "italic")).toEqual({
    value: "*un*\n*deux*",
    start: 1,
    end: 10,
  });
  expect(toggleStyle("un\n\ndeux", 0, 8, "bold").value).toBe("**un**\n\n**deux**");
});

test("italic on bold and back keeps the bold", () => {
  const on = toggleStyle("**x**", 2, 3, "italic");
  expect(on).toEqual({ value: "***x***", start: 3, end: 4 });
  expect(toggleStyle(on.value, on.start, on.end, "italic")).toEqual({
    value: "**x**",
    start: 2,
    end: 3,
  });
  expect(toggleStyle(on.value, on.start, on.end, "bold")).toEqual({
    value: "*x*",
    start: 1,
    end: 2,
  });
});

test("a second tap on the caret takes the empty pair back out", () => {
  const once = toggleStyle("ab", 1, 1, "bold");
  expect(toggleStyle(once.value, once.start, once.end, "bold")).toEqual({
    value: "ab",
    start: 1,
    end: 1,
  });
  const italic = toggleStyle("ab", 1, 1, "italic");
  expect(toggleStyle(italic.value, italic.start, italic.end, "italic").value).toBe("ab");
  // Between the stars of an empty bold pair, I adds italic rather than eating them.
  expect(toggleStyle("a****b", 3, 3, "italic").value).toBe("a******b");
});
