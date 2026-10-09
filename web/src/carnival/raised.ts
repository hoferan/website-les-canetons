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
 * The members' area's card (ADR 0029): the same ink outline, thinner, with no
 * shadow. Most of these cards hold raised buttons, and a raised button on a
 * raised card no longer stands out, so here the shadow stays a sign that
 * something can be pressed.
 */
export const OUTLINED_CARD = "rounded-[18px] border-2 border-ink bg-panel";

/**
 * The carnival colours a row of cards takes turns with, so neighbours do not
 * look alike. Each carries ink, never white.
 */
export const CARD_TINTS = ["bg-yellow", "bg-cyan", "bg-lime", "bg-pink", "bg-lilac"];
