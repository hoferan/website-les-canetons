import { findPairs, hiddenStars, innerRange, pairsHolding, type Pair } from "../inlineStyles";

/** A text after a change, and the selection to put back on it. */
export type Edit = { value: string; start: number; end: number };

const MARKER: Record<Pair["style"], string> = { bold: "**", italic: "*" };

/**
 * What the B and I buttons do to a text and its selection (#372).
 *
 * - The selection, or the caret, already in that style (`pairsHolding`), on
 *   every line it touches: those pairs' stars come off.
 * - A caret anywhere else: an empty pair goes in, the caret between, so what
 *   is typed next is in that style. Between empty pairs already put down, the
 *   stars on each side count the styles waiting there (one for italic, two
 *   for bold, three for both), and the tap adds or takes away its own.
 * - A selection: its words are wrapped. Spaces at its ends stay outside the
 *   stars, since a pair cannot close after a space (a double click on Windows
 *   takes the space after the word too), and each line is wrapped on its own,
 *   since a pair cannot span a line.
 *
 * The selection that comes back covers the same words, without the stars.
 */
export function toggleStyle(value: string, start: number, end: number, style: Pair["style"]): Edit {
  const pairs = findPairs(value);
  const holding = pairsHolding(value, start, end, style);
  if (holding.length > 0) return unwrap(value, start, end, holding);

  const marker = MARKER[style];
  let from = start;
  let to = end;
  while (from < to && /\s/.test(value[from]!)) from++;
  while (to > from && /\s/.test(value[to - 1]!)) to--;
  if (from === to) {
    // Empty pairs are no pairs yet, so the buttons never show them on: a
    // second tap takes its own stars back out, rather than piling up more.
    const waiting = start === end ? starsAround(value, start) : -1;
    if (waiting >= 0 && waiting <= 3) {
      const stars = "*".repeat(waiting ^ marker.length);
      const caret = start - waiting + stars.length;
      return {
        value: value.slice(0, start - waiting) + stars + stars + value.slice(start + waiting),
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

/** Takes the pairs' own stars off, keeping the selection on the same words. */
function unwrap(value: string, start: number, end: number, pairs: Pair[]): Edit {
  const dropped = hiddenStars(pairs);
  // Every offset moves back by the stars taken out before it.
  const moved = (at: number) => at - [...dropped].filter((star) => star < at).length;
  let next = "";
  for (let i = 0; i < value.length; i++) if (!dropped.has(i)) next += value[i];
  return { value: next, start: moved(start), end: moved(end) };
}
