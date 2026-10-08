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

/**
 * How far each shape in Confetti.tsx reaches from its centre at scale 1, in
 * its own units, rounded up. A squiggle is 28 wide, so at the largest scale it
 * reaches 31px from the point it is placed at.
 */
export const REACH: Record<ConfettiKind, number> = {
  strip: 7,
  dot: 4,
  triangle: 7,
  squiggle: 15,
  star: 9,
  note: 12,
};

/** The clear gap left between the edge of a piece and anything it avoids. */
const GAP = 6;

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
 * A piece whose drawn shape would come within GAP of an avoided box is
 * dropped rather than moved, so the gaps around text stay clean and nothing
 * piles up at their edges. That makes the count an upper bound: a box that is mostly text gets
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
    // Measured from the shape's reach, not its centre: a centre-only margin
    // let a full-size squiggle lie across a heading's first letters.
    const clearance = REACH[piece.kind] * piece.scale + GAP;
    const covered = avoid.some(
      (box) =>
        x > box.left - clearance &&
        x < box.right + clearance &&
        y > box.top - clearance &&
        y < box.bottom + clearance,
    );
    if (!covered) {
      pieces.push(piece);
    }
  }

  return pieces;
}
