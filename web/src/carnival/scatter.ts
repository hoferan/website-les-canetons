import { generator, type Look, randomPiece, REACH } from "./piece";

export type { ConfettiKind } from "./piece";

/** A confetto and where it lies. */
export type Piece = Look & { x: number; y: number };

export type Box = { left: number; top: number; right: number; bottom: number };

/** One piece per this many square pixels, measured on the mock-ups at 390 and 1280. */
const AREA_PER_PIECE = 11_000;

/** The clear gap left between the edge of a piece and anything it avoids. */
const GAP = 6;

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
    const piece: Piece = { x, y, ...randomPiece(random, palette) };
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
