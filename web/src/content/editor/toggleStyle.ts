import { findPairs, hiddenStars, innerRange, type Pair } from "../inlineStyles";

/** A text after a change, and the selection to put back on it. */
export type Edit = { value: string; start: number; end: number };

const MARKER: Record<Pair["style"], string> = { bold: "**", italic: "*" };

/**
 * What the B and I buttons do to a text and its selection (#372).
 *
 * - The selection, or the caret, inside words of that style, or a selection
 *   of exactly such words with their stars: the stars come off.
 * - A caret anywhere else: an empty pair goes in, the caret between, so what
 *   is typed next is in that style.
 * - A selection: its words are wrapped. Spaces at its ends stay outside the
 *   stars, since a pair cannot close after a space (a double click on Windows
 *   takes the space after the word too), and each line is wrapped on its own,
 *   since a pair cannot span a line.
 *
 * The selection that comes back covers the same words, without the stars.
 */
export function toggleStyle(value: string, start: number, end: number, style: Pair["style"]): Edit {
  const pairs = findPairs(value);
  const own = pairs
    .filter((pair) => pair.style === style)
    .filter((pair) => {
      const inner = innerRange(pairs, pair);
      const inside = inner.start <= start && end <= inner.end;
      const withStars = start === pair.open && end === pair.close + pair.size;
      return inside || withStars;
    })
    // The innermost one, if the same style nests.
    .sort((a, b) => b.open - a.open)[0];
  if (own) return unwrap(value, start, end, own);

  const marker = MARKER[style];
  let from = start;
  let to = end;
  while (from < to && /\s/.test(value[from]!)) from++;
  while (to > from && /\s/.test(value[to - 1]!)) to--;
  if (from === to) {
    // A second tap on an empty pair takes it out again, rather than piling
    // up stars: the pair is no pair yet, so the button never showed it on.
    if (start === end && starsAround(value, start) === marker.length) {
      const caret = start - marker.length;
      return {
        value: value.slice(0, caret) + value.slice(start + marker.length),
        start: caret,
        end: caret,
      };
    }
    const caret = start + marker.length;
    return {
      value: value.slice(0, start) + marker + marker + value.slice(start),
      start: caret,
      end: caret,
    };
  }

  // A selection that starts or ends inside a pair takes the whole pair in:
  // stars put down in the middle of it would close it early and show on the
  // page. A selection wholly inside a pair of the other style stays as it is.
  for (let grown = true; grown;) {
    grown = false;
    for (const pair of pairs) {
      const outer = { start: pair.open, end: pair.close + pair.size };
      const inner = innerRange(pairs, pair);
      const overlaps = from < outer.end && to > outer.start;
      const covers = from <= outer.start && to >= outer.end;
      const within = inner.start <= from && to <= inner.end;
      if (overlaps && !covers && !within) {
        from = Math.min(from, outer.start);
        to = Math.max(to, outer.end);
        grown = true;
      }
    }
  }

  // Pairs of the same style inside it merge into the new one.
  const merged = pairs.filter(
    (pair) => pair.style === style && from <= pair.open && pair.close + pair.size <= to,
  );
  const dropped = hiddenStars(merged);
  let words = "";
  for (let i = from; i < to; i++) if (!dropped.has(i)) words += value[i];

  const wrapped = words
    .split("\n")
    .map((line) => {
      const [, lead, text, trail] = /^(\s*)(.*?)(\s*)$/.exec(line)!;
      return text === "" ? line : `${lead}${marker}${text}${marker}${trail}`;
    })
    .join("\n");
  const next = value.slice(0, from) + wrapped + value.slice(to);

  // The selection goes on the words, past any star at either edge.
  const hidden = hiddenStars(findPairs(next));
  let first = from + marker.length;
  let last = from + wrapped.length - marker.length;
  while (first < last && hidden.has(first)) first++;
  while (last > first && hidden.has(last - 1)) last--;
  return { value: next, start: first, end: last };
}

/** How many stars sit on each side of the caret, when both sides have as many; else -1. */
function starsAround(value: string, at: number): number {
  let before = 0;
  while (value[at - 1 - before] === "*") before++;
  let after = 0;
  while (value[at + after] === "*") after++;
  return before === after ? before : -1;
}

/** Takes a pair's own stars off, keeping the selection on the same words. */
function unwrap(value: string, start: number, end: number, pair: Pair): Edit {
  const { open, close, size } = pair;
  const moved = (at: number) =>
    at -
    (at > open ? Math.min(size, at - open) : 0) -
    (at > close ? Math.min(size, at - close) : 0);
  return {
    value: value.slice(0, open) + value.slice(open + size, close) + value.slice(close + size),
    start: moved(start),
    end: moved(end),
  };
}
