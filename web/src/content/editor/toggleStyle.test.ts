import { expect, test } from "vitest";

import { styledRuns, stylesAt } from "../inlineStyles";
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

/** The text a visitor reads: every star a pair uses is gone. */
const read = (value: string) =>
  value
    .split("\n")
    .map((line) =>
      styledRuns(line)
        .map((run) => run.text)
        .join(""),
    )
    .join("\n");

/** Toggles `style` on the first occurrence of `words`. */
function on(value: string, words: string, style: "bold" | "italic") {
  const at = value.indexOf(words);
  if (at === -1) throw new Error(`"${words}" is not in "${value}"`);
  return toggleStyle(value, at, at + words.length, style);
}

test("a selection starting inside bold words merges with them", () => {
  const edit = on("**la musique** de", "sique** de", "bold");
  expect(edit.value).toBe("**la musique de**");
  expect(read(edit.value)).toBe("la musique de");
});

test("a selection ending inside bold words merges with them", () => {
  expect(on("de **la musique**", "de **la", "bold").value).toBe("**de la musique**");
});

test("a selection starting inside italic words takes them in whole", () => {
  const edit = on("*la musique* de", "sique* de", "bold");
  expect(read(edit.value)).toBe("la musique de");
  expect(stylesAt(edit.value, edit.start, edit.end).bold).toBe(true);
});

test("a second tap on a bold selection of several lines takes the bold off", () => {
  const once = toggleStyle("un\ndeux", 0, 7, "bold");
  expect(once).toEqual({ value: "**un**\n**deux**", start: 2, end: 13 });
  expect(toggleStyle(once.value, once.start, once.end, "bold")).toEqual({
    value: "un\ndeux",
    start: 0,
    end: 7,
  });
});

test("B, I, B at a caret leaves italic to type in", () => {
  let edit = toggleStyle("ab", 1, 1, "bold");
  edit = toggleStyle(edit.value, edit.start, edit.end, "italic");
  expect(edit).toEqual({ value: "a******b", start: 4, end: 4 });
  edit = toggleStyle(edit.value, edit.start, edit.end, "bold");
  expect(edit).toEqual({ value: "a**b", start: 2, end: 2 });
});
