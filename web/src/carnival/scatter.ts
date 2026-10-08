export type ConfettiKind = "strip" | "dot" | "squiggle" | "star" | "note" | "triangle";

export type Piece = {
  x: number;
  y: number;
  rotate: number;
  scale: number;
  kind: ConfettiKind;
  /** An index into whatever palette the caller draws with. */
  colour: number;
};

export type Box = { left: number; top: number; right: number; bottom: number };

const KINDS: ConfettiKind[] = ["strip", "strip", "dot", "squiggle", "star", "note", "triangle"];

/** One piece per this many square pixels, measured on the mock-ups at 390 and 1280. */
const AREA_PER_PIECE = 11_000;

/** How far a piece's centre stays from anything it avoids. */
const MARGIN = 14;

/**
 * A seeded generator, so a page scatters the same confetti on every visit and
 * a screenshot taken today matches one taken next week.
 */
function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/**
 * Where the confetti goes inside a box of the given size.
 *
 * A piece that lands within MARGIN of an avoided box is dropped rather than
 * moved, so the gaps around text stay clean and nothing piles up at their
 * edges. That makes the count an upper bound: a box that is mostly text gets
 * fewer pieces, which is the right answer for it.
 */
export function scatter({
  width,
  height,
  seed,
  avoid,
  palette = 4,
  density = 1,
}: {
  width: number;
  height: number;
  seed: number;
  avoid: Box[];
  palette?: number;
  /**
   * A multiple of the mock-ups' density, for a surface whose free space is a
   * small part of it: the phone menu's list covers most of the screen, and at
   * the usual density its empty lower half got four pieces.
   */
  density?: number;
}): Piece[] {
  const random = generator(seed);
  const wanted = Math.round((width * height * density) / AREA_PER_PIECE);
  const pieces: Piece[] = [];

  for (let i = 0; i < wanted; i++) {
    const x = random() * width;
    const y = random() * height;
    const piece: Piece = {
      x,
      y,
      rotate: Math.floor(random() * 360),
      scale: 1 + random() * 1.1,
      kind: KINDS[Math.floor(random() * KINDS.length)] ?? "dot",
      colour: Math.floor(random() * palette),
    };
    const covered = avoid.some(
      (box) =>
        x > box.left - MARGIN &&
        x < box.right + MARGIN &&
        y > box.top - MARGIN &&
        y < box.bottom + MARGIN,
    );
    if (!covered) {
      pieces.push(piece);
    }
  }

  return pieces;
}
