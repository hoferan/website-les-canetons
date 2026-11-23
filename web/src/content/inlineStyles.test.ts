import { expect, test } from "vitest";

import { dropEmptyPairs, findPairs, innerRange, styledRuns, stylesAt } from "./inlineStyles";

/** Each run as "B:", "I:", "BI:" or ":" followed by its text. */
const shown = (line: string) =>
  styledRuns(line).map((run) => `${run.bold ? "B" : ""}${run.italic ? "I" : ""}:${run.text}`);

test("plain text is one plain run", () => {
  expect(shown("De 7 à 18 ans")).toEqual([":De 7 à 18 ans"]);
});

test("double stars make bold, single stars italic", () => {
  expect(shown("et **pas besoin** de")).toEqual([":et ", "B:pas besoin", ": de"]);
  expect(shown("du *samedi matin*.")).toEqual([":du ", "I:samedi matin", ":."]);
});

test("bold and italic nest", () => {
  expect(shown("**très *bien***")).toEqual(["B:très ", "BI:bien"]);
  expect(shown("***x***")).toEqual(["BI:x"]);
  expect(shown("*a **b** c*")).toEqual(["I:a ", "BI:b", "I: c"]);
});

test("a star that closes nothing stays a star", () => {
  for (const line of ["5 * 3 * 2", "note*", "**open", "* item", "**", "****", "a * b"]) {
    expect(shown(line)).toEqual([`:${line}`]);
  }
  expect(shown("*a*b*")).toEqual(["I:a", ":b*"]);
});

test("an empty line has no runs", () => {
  expect(styledRuns("")).toEqual([]);
});

test("a pair never spans a line", () => {
  expect(findPairs("**a\nb**")).toEqual([]);
  expect(findPairs("a\n**b**")).toEqual([{ style: "bold", open: 2, close: 5, size: 2 }]);
});

test("the pairs of ***x*** and the styles at x", () => {
  const pairs = findPairs("***x***");
  expect(pairs).toContainEqual({ style: "bold", open: 1, close: 4, size: 2 });
  expect(pairs).toContainEqual({ style: "italic", open: 0, close: 6, size: 1 });
  const italic = pairs.find((pair) => pair.style === "italic")!;
  expect(innerRange(pairs, italic)).toEqual({ start: 3, end: 4 });
  expect(stylesAt("***x***", 3, 4)).toEqual({ bold: true, italic: true });
  expect(stylesAt("a **b** c", 0, 1)).toEqual({ bold: false, italic: false });
  expect(stylesAt("a **bc** d", 4, 4)).toEqual({ bold: true, italic: false });
});

test("dropEmptyPairs takes out the pairs nobody typed into, and nothing else", () => {
  expect(dropEmptyPairs("a****b")).toBe("ab");
  expect(dropEmptyPairs("Viens **")).toBe("Viens ");
  expect(dropEmptyPairs("****")).toBe("");
  expect(dropEmptyPairs("un\n**deux**\n****")).toBe("un\n**deux**\n");
  for (const kept of ["**gras** et *penché*", "***x***", "5 * 3", "note*", "a *** b"]) {
    expect(dropEmptyPairs(kept)).toBe(kept);
  }
});
