/**
 * The nav's classes, shared by the desktop bar, the phone list and
 * session/AccountMenu so the account rows cannot drift from their neighbours.
 *
 * The current page is violet on both: an underline on the desktop bar, a bar
 * down the left edge in the phone list. Both sit on the light panel. The phone
 * panel used to be dark, with the current page in pink, because violet on
 * --color-stage is about 2.6:1 and pink on white about 3:1: no single colour
 * passed on both surfaces, so the same state read two ways (#99).
 */

/** One desktop bar entry. `whitespace-nowrap` because DesktopNav measures
 *  each entry on one line; a label that wrapped would break the arithmetic. */
export const DESK_LINK = "focus-ring flex items-center gap-1 py-1 whitespace-nowrap";
export const DESK_ACTIVE = "border-b-2 border-violet font-semibold text-violet";
export const DESK_IDLE = "text-ink-muted hover:text-ink";

/**
 * One phone row: 48px, full width. The phone nav's targets were about 24px
 * before this existed, roughly half the 44px minimum.
 */
export const PHONE_ROW = "focus-ring flex min-h-12 w-full items-center gap-2 px-4 text-left";
export const PHONE_ACTIVE = "border-l-4 border-violet pl-3 font-semibold text-violet";
export const PHONE_IDLE = "text-ink-muted hover:text-ink";

/** The divider between phone rows. */
export const PHONE_ITEM = "border-b border-line last:border-0";
