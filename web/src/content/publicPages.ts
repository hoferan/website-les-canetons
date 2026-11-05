import type { TranslationKey } from "../i18n";

/**
 * The public nav in order of importance, left to right. The desktop bar folds
 * from the right into "Plus" when it runs out of room, so this is also the
 * order in which entries disappear (#99).
 *
 * "Nous rejoindre" is first because recruiting is what this site is for: the
 * band takes players from 7 to 18, so the visitor worth optimising for is a
 * parent deciding whether to turn up on Saturday. The pages a parent needs
 * least come last, then the external sites, which fold first.
 *
 * Every entry must be a route that exists. A hero's or the footer's buttons may lead to any
 * of them (`isActionTarget`), so a page the band can reach from a button is a
 * page a visitor can reach from the nav.
 */
export const PUBLIC_NAV: Array<{ to: string; labelKey: TranslationKey }> = [
  { to: "/join", labelKey: "nav.join" },
  { to: "/agenda", labelKey: "nav.agenda" },
  { to: "/band", labelKey: "nav.band" },
  { to: "/contact", labelKey: "nav.contact" },
  { to: "/committee", labelKey: "nav.committee" },
  { to: "/history", labelKey: "nav.history" },
];

/** Whether a path is one of the public pages. */
export function isPublicPage(to: string): boolean {
  return PUBLIC_NAV.some((page) => page.to === to);
}
