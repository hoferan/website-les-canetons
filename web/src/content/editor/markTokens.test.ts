import { expect, test } from "vitest";

import { markOf, nextRun, runOf, tokenize } from "./markTokens";

const view = (title: string) =>
  tokenize(title).map((token) => (token.tappable ? token.text : `[${token.text}]`));

test("an elision is cut after the apostrophe, and punctuation stands apart", () => {
  expect(view("guggen d’enfants de Fribourg, depuis 2002.")).toEqual([
    "guggen",
    "d’",
    "enfants",
    "de",
    "Fribourg",
    "[,]",
    "depuis",
    "2002",
    "[.]",
  ]);
  expect(view("l'enfant")).toEqual(["l'", "enfant"]);
});

test("a compound is cut after its hyphen", () => {
  expect(view("Die Kinder-Guggenmusik")).toEqual(["Die", "Kinder-", "Guggenmusik"]);
});

test("quotes, guillemets and an ellipsis are punctuation", () => {
  expect(view("« Salut », dit-il…")).toEqual(["[«]", "Salut", "[»,]", "dit-", "il", "[…]"]);
});

test("tokens keep their offsets", () => {
  const title = "Les d’enfants";
  for (const token of tokenize(title)) expect(title.slice(token.start, token.end)).toBe(token.text);
});

const tokens = tokenize("a b c d e");

test("nothing picked: the tapped word", () => {
  expect(nextRun(tokens, null, 2)).toEqual([2, 2]);
});

test("a word outside the run stretches it, on either side", () => {
  expect(nextRun(tokens, [1, 2], 4)).toEqual([1, 4]);
  expect(nextRun(tokens, [2, 3], 0)).toEqual([0, 3]);
});

test("the first or last word shrinks the run, the only word clears it", () => {
  expect(nextRun(tokens, [1, 3], 1)).toEqual([2, 3]);
  expect(nextRun(tokens, [1, 3], 3)).toEqual([1, 2]);
  expect(nextRun(tokens, [2, 2], 2)).toBeNull();
});

test("a word strictly inside becomes the run alone", () => {
  expect(nextRun(tokens, [0, 4], 2)).toEqual([2, 2]);
});

test("shrinking skips punctuation", () => {
  const punctuated = tokenize("a, b");
  expect(nextRun(punctuated, [0, 2], 0)).toEqual([2, 2]);
  expect(nextRun(punctuated, [0, 2], 1)).toEqual([0, 2]);
});

test("markOf keeps the spaces and the commas inside the run", () => {
  const title = "guggen, d’enfants de Fribourg";
  const t = tokenize(title);
  expect(markOf(title, t, [0, 3])).toBe("guggen, d’enfants");
  expect(markOf(title, t, [2, 3])).toBe("d’enfants");
  expect(markOf(title, t, null)).toBeUndefined();
});

test("runOf finds the first occurrence, on word edges", () => {
  const title = "la guggen et la guggen";
  const t = tokenize(title);
  expect(runOf(title, t, "la guggen")).toEqual([0, 1]);
  expect(runOf(title, t, "gugg")).toBeNull();
  expect(runOf(title, t, "ugg")).toBeNull();
  expect(runOf(title, t, "absent")).toBeNull();
  expect(runOf(title, t, "")).toBeNull();
  expect(runOf(title, t, undefined)).toBeNull();
});
