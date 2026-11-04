/** One word, or one stretch of punctuation, of a title. */
export type MarkToken = {
  text: string;
  /** Offsets into the title, `end` exclusive. */
  start: number;
  end: number;
  /** Punctuation is shown but cannot be picked. */
  tappable: boolean;
};

/** A picked run of tokens, first and last index, both inclusive. */
export type MarkRun = [number, number];

const PUNCTUATION = new Set([".", ",", ";", ":", "!", "?", "«", "»", '"', "(", ")", "…"]);
// A word is cut after these, so `d’enfants` offers `d’` and `enfants` apart,
// and so does `Kinder-Guggenmusik`.
const CUT_AFTER = new Set(["’", "'", "-"]);

/**
 * Cuts a title into the pieces a person taps to choose the highlighted words.
 *
 * Whitespace separates words; punctuation at a word's start or end is a piece
 * of its own that cannot be tapped, and a word is cut after an apostrophe or a
 * hyphen. The pieces keep their offsets, so a run maps back onto the exact
 * title text.
 */
export function tokenize(title: string): MarkToken[] {
  const tokens: MarkToken[] = [];
  const push = (start: number, end: number, tappable: boolean) => {
    if (end > start) tokens.push({ text: title.slice(start, end), start, end, tappable });
  };

  for (const word of title.matchAll(/\S+/g)) {
    const from = word.index;
    const to = from + word[0].length;
    let a = from;
    let b = to;
    while (a < b && PUNCTUATION.has(title[a]!)) a++;
    while (b > a && PUNCTUATION.has(title[b - 1]!)) b--;

    push(from, a, false);
    if (a === b) continue;
    let piece = a;
    for (let i = a; i < b; i++) {
      if (CUT_AFTER.has(title[i]!) && i + 1 < b) {
        push(piece, i + 1, true);
        piece = i + 1;
      }
    }
    push(piece, b, true);
    push(b, to, false);
  }
  return tokens;
}

/**
 * The run after a tap. Nothing picked: that word. A word outside the run
 * stretches it. The run's first or last word shrinks it by that word, and the
 * only word leaves nothing. A word strictly inside becomes the run alone.
 */
export function nextRun(tokens: MarkToken[], run: MarkRun | null, tapped: number): MarkRun | null {
  if (!tokens[tapped]?.tappable) return run;
  if (run === null) return [tapped, tapped];
  const [first, last] = run;
  if (tapped < first) return [tapped, last];
  if (tapped > last) return [first, tapped];
  if (first === last) return null;
  if (tapped === first) return [neighbour(tokens, first, 1), last];
  if (tapped === last) return [first, neighbour(tokens, last, -1)];
  return [tapped, tapped];
}

/** The nearest tappable token from `from`, in `step` direction. */
function neighbour(tokens: MarkToken[], from: number, step: 1 | -1): number {
  let i = from + step;
  while (!tokens[i]?.tappable) i += step;
  return i;
}

/** The title text a run covers, spaces and inner punctuation included. */
export function markOf(
  title: string,
  tokens: MarkToken[],
  run: MarkRun | null,
): string | undefined {
  if (run === null) return undefined;
  return title.slice(tokens[run[0]]!.start, tokens[run[1]]!.end);
}

/**
 * The run a stored mark stands for: where its first occurrence in the title
 * starts and ends on a word, as the page highlights the first occurrence.
 * Otherwise nothing.
 */
export function runOf(title: string, tokens: MarkToken[], mark?: string): MarkRun | null {
  if (!mark) return null;
  const at = title.indexOf(mark);
  if (at === -1) return null;
  const first = tokens.findIndex((token) => token.tappable && token.start === at);
  const last = tokens.findIndex((token) => token.tappable && token.end === at + mark.length);
  return first === -1 || last < first ? null : [first, last];
}
