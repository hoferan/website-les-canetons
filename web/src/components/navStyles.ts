/**
 * The desktop bar's classes, shared by its entries and its "Plus" trigger,
 * and the highlight the phone menu shares with it.
 *
 * The bar sits on the stage (ADR 0029), so the entries are white Bungee and
 * the current page is the one highlight the site uses: yellow under ink, on
 * the label only, the same mark a heading puts on the word that matters.
 */

/** One desktop bar entry. `whitespace-nowrap` because DesktopNav measures
 *  each entry on one line; a label that wrapped would break the arithmetic. */
export const DESK_LINK =
  "focus-ring-stage flex items-center gap-1 rounded-sm py-1 font-display text-[13px] whitespace-nowrap uppercase";
export const DESK_IDLE = "text-white hover:text-yellow";
/** Applied to the label's span, not the link, so the yellow hugs the word. */
export const NAV_HERE = "bg-yellow px-[0.14em] text-ink";
