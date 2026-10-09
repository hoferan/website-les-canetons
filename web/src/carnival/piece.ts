export type ConfettiKind = "strip" | "dot" | "squiggle" | "star" | "note" | "triangle";

/** How one confetto looks, wherever it is put. */
export type Look = {
  rotate: number;
  scale: number;
  kind: ConfettiKind;
  /** An index into whatever palette the caller draws with. */
  colour: number;
};

/** Strips twice, because they are what a handful of real confetti is mostly made of. */
export const KINDS: ConfettiKind[] = [
  "strip",
  "strip",
  "dot",
  "squiggle",
  "star",
  "note",
  "triangle",
];

/**
 * How far each shape in ConfettiPiece.tsx reaches from its centre at scale 1,
 * in its own units, rounded up. A squiggle is 28 wide, so at the largest scale
 * it reaches 31px from the point it is placed at.
 */
export const REACH: Record<ConfettiKind, number> = {
  strip: 7,
  dot: 4,
  triangle: 7,
  squiggle: 15,
  star: 9,
  note: 12,
};

/**
 * A seeded generator, so a page scatters the same confetti on every visit and
 * a screenshot taken today matches one taken next week.
 */
export function generator(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 4_294_967_296;
  };
}

/**
 * A random confetto: its shape, angle, size and colour. Pass a seeded
 * generator for decoration that must look the same on every visit, or
 * Math.random for a throw.
 *
 * The draws come in a fixed order, angle, size, shape, colour, which scatter()
 * relies on: changing it would move every piece on every page.
 */
export function randomPiece(random: () => number, palette: number): Look {
  return {
    rotate: Math.floor(random() * 360),
    scale: 1 + random() * 1.1,
    kind: KINDS[Math.floor(random() * KINDS.length)] ?? "dot",
    colour: Math.floor(random() * palette),
  };
}
