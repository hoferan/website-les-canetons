/**
 * The raised card on cream (ADR 0029): a 3px ink outline and the hard offset
 * shadow. Cards on cream stay straight; only tiles on a coloured band tilt.
 *
 * Passed to the vendored Card through `cn()`, so each of these replaces the
 * Card base's own radius, border width and shadow rather than landing beside
 * it. The shadow does so only because `lib/utils.ts` teaches tailwind-merge
 * the raised shadows.
 */
export const RAISED_CARD = "rounded-[18px] border-3 border-ink bg-panel shadow-raised";

/**
 * The carnival colours a row of cards takes turns with, so neighbours do not
 * look alike. Each carries ink, never white.
 */
export const CARD_TINTS = ["bg-yellow", "bg-cyan", "bg-lime", "bg-pink", "bg-lilac"];
