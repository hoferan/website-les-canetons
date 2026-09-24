/**
 * The desktop bar's classes, shared by its entries, its "Plus" trigger and the
 * login link. The current page is violet with an underline.
 */

/** One desktop bar entry. `whitespace-nowrap` because DesktopNav measures
 *  each entry on one line; a label that wrapped would break the arithmetic. */
export const DESK_LINK = "focus-ring flex items-center gap-1 py-1 whitespace-nowrap";
export const DESK_ACTIVE = "border-b-2 border-violet font-semibold text-violet";
export const DESK_IDLE = "text-ink-muted hover:text-ink";
