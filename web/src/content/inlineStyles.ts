/**
 * Bold and italic inside a block's text (#372, ADR 0049).
 *
 * A text stores them as a small Markdown subset: `**bold**` and `*italic*`,
 * nested as `**très *bien***` or `***both***`. A pair never runs past the end
 * of a line. A star that closes nothing stays a star, so a text typed before
 * styles existed, such as "5 * 3", reads as it always did. There are no
 * escapes, links or other Markdown.
 *
 * The matching is CommonMark's emphasis pass, cut down to what that needs: a
 * run of stars can open when a non-space follows it, and close when a
 * non-space comes before it. This file ships to every visitor, so it stays
 * small and builds no HTML: the page renders the runs as React elements.
 */

/** One matched pair. Offsets are into the whole text. */
export type Pair = {
  style: "bold" | "italic";
  /** The pair's first opening star. */
  open: number;
  /** The pair's first closing star. */
  close: number;
  /** How many stars each side: 2 for bold, 1 for italic. */
  size: 1 | 2;
};

/** A stretch of a line with one style, its stars already left out. */
export type StyledRun = { text: string; bold: boolean; italic: boolean };

type StarRun = { pos: number; length: number; canOpen: boolean; canClose: boolean };

const isSpace = (char: string | undefined) => char === undefined || /\s/.test(char);

/** Every matched pair in the text, line by line. */
export function findPairs(text: string): Pair[] {
  const pairs: Pair[] = [];
  let lineStart = 0;
  for (const line of text.split("\n")) {
    pairsOfLine(line, lineStart, pairs);
    lineStart += line.length + 1;
  }
  return pairs;
}

function pairsOfLine(line: string, offset: number, pairs: Pair[]) {
  const openers: StarRun[] = [];
  for (const match of line.matchAll(/\*+/g)) {
    const pos = match.index;
    const length = match[0].length;
    const run: StarRun = {
      pos,
      length,
      canOpen: !isSpace(line[pos + length]),
      canClose: !isSpace(line[pos - 1]),
    };

    while (run.canClose && run.length > 0 && openers.length > 0) {
      const opener = openers[openers.length - 1]!;
      const size: 1 | 2 = opener.length >= 2 && run.length >= 2 ? 2 : 1;
      pairs.push({
        style: size === 2 ? "bold" : "italic",
        open: offset + opener.pos + opener.length - size,
        close: offset + run.pos,
        size,
      });
      opener.length -= size;
      run.pos += size;
      run.length -= size;
      if (opener.length === 0) openers.pop();
    }
    if (run.length > 0 && run.canOpen) openers.push(run);
  }
}

/** The offsets of the stars the pairs use, which the page does not show. */
function hiddenStars(pairs: Pair[]): Set<number> {
  const hidden = new Set<number>();
  for (const pair of pairs) {
    for (let i = 0; i < pair.size; i++) {
      hidden.add(pair.open + i);
      hidden.add(pair.close + i);
    }
  }
  return hidden;
}

/** One line cut into runs of the same style, the pairs' stars left out. */
export function styledRuns(line: string): StyledRun[] {
  const pairs = findPairs(line);
  const hidden = hiddenStars(pairs);
  const runs: StyledRun[] = [];
  for (let i = 0; i < line.length; i++) {
    if (hidden.has(i)) continue;
    const within = pairs.filter((pair) => pair.open < i && i < pair.close);
    const bold = within.some((pair) => pair.style === "bold");
    const italic = within.some((pair) => pair.style === "italic");
    const last = runs[runs.length - 1];
    if (last && last.bold === bold && last.italic === italic) last.text += line[i];
    else runs.push({ text: line[i]!, bold, italic });
  }
  return runs;
}

/** A pair's words: from its own stars inward, minus any star at either edge. */
export function innerRange(pairs: Pair[], pair: Pair): { start: number; end: number } {
  const hidden = hiddenStars(pairs);
  let start = pair.open + pair.size;
  let end = pair.close;
  while (start < end && hidden.has(start)) start++;
  while (end > start && hidden.has(end - 1)) end--;
  return { start, end };
}

/** Whether the selection, or the caret, sits inside bold or italic words. */
export function stylesAt(
  text: string,
  start: number,
  end: number,
): { bold: boolean; italic: boolean } {
  const pairs = findPairs(text);
  const on = (style: Pair["style"]) =>
    pairs.some((pair) => {
      if (pair.style !== style) return false;
      const inner = innerRange(pairs, pair);
      return inner.start <= start && end <= inner.end;
    });
  return { bold: on("bold"), italic: on("italic") };
}
