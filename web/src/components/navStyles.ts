/**
 * The nav row classes, shared by Layout and session/AccountMenu so the account
 * rows cannot drift from their neighbours.
 */

/**
 * One nav row. On a phone this is a 48px full-width row with a divider; above
 * `md` it collapses back to an inline item. Both sit on the light panel.
 *
 * Extracted because there are TWELVE call sites — ten links, the Flickr anchor
 * and the auth item — and the phone nav's targets were about 24px before this,
 * roughly half the 44px minimum. A rule applied by hand twelve times is a rule
 * that lasts until the next item is added.
 */
export const NAV_ROW = "focus-ring flex min-h-12 items-center px-4 md:min-h-0 md:px-0 md:py-1";

/**
 * The active item is violet on every screen: a bar down its left edge in the
 * phone list, an underline on the desktop bar.
 *
 * LIGHT ON THE PHONE TOO (#99). The phone panel used to be dark, with the
 * active item in pink, because violet on --color-stage is about 2.6:1 and pink
 * on white about 3:1: no single colour passed on both surfaces, so the same
 * state read two ways. It now uses the same light panel as the desktop bar.
 * Only the header with the logo keeps the stage colour.
 */
export const NAV_ROW_ACTIVE =
  "border-l-4 border-violet pl-3 font-semibold text-violet md:border-b-2 md:border-l-0 md:pl-0";
export const NAV_ROW_IDLE = "text-ink-muted hover:text-ink";

/** The divider between phone rows, gone above `md`. */
export const NAV_ITEM = "border-b border-line last:border-0 md:border-0";
