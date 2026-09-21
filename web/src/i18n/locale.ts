/**
 * Which locale a URL is in, and where the router should be mounted for it.
 *
 * NO REACT AND NO ROUTER IN THIS FILE, deliberately. Unit tests mount
 * MemoryRouter rather than BrowserRouter, so `basename` is never exercised
 * there — locale resolution has to be testable, and every component has to be
 * renderable in a chosen locale, without a router in the way.
 *
 * THE URL IS THE ONLY AUTHORITY ON LOCALE. Nothing here reads localStorage or
 * navigator.language. A stored preference that could override the URL would
 * mean a /de/agenda link rendering French for whoever it was sent to, which
 * would defeat the reason prefixed URLs were chosen at all.
 */

export type Locale = "fr" | "de-CH";

export const LOCALES: readonly Locale[] = ["fr", "de-CH"];

/** French is unprefixed, so it is also what an unrecognised path resolves to. */
export const DEFAULT_LOCALE: Locale = "fr";

/** The URL segment. Short on purpose: there is only one German variant. */
export const GERMAN_SEGMENT = "de";

/**
 * MATCHED AS A WHOLE SEGMENT, never as a string prefix.
 *
 * `pathname.startsWith("/de")` would claim /design, /depot and /details, mount
 * the router at /de for them, and render a blank page — React Router refuses a
 * basename the URL does not actually begin with. Anchoring on the segment
 * boundary is what makes any future route name safe for free.
 */
const GERMAN_PATH = new RegExp(`^/${GERMAN_SEGMENT}(?=/|$)`);

export function localeFromPath(pathname: string): { locale: Locale; basename: string } {
  return GERMAN_PATH.test(pathname)
    ? { locale: "de-CH", basename: `/${GERMAN_SEGMENT}` }
    : { locale: DEFAULT_LOCALE, basename: "/" };
}

/**
 * The same page in another locale, as an origin-absolute path.
 *
 * Takes a FULL pathname (prefix included) and returns a full pathname, so it
 * can be handed straight to `window.location.assign`. Switching locale is a
 * real navigation rather than a re-render — `basename` is fixed when the
 * router mounts — and that is a feature: each locale gets a clean boot with no
 * stale i18next state to reason about.
 */
export function pathInLocale(pathname: string, target: Locale): string {
  const bare = pathname.replace(GERMAN_PATH, "") || "/";

  if (target === DEFAULT_LOCALE) {
    return bare;
  }

  return bare === "/" ? `/${GERMAN_SEGMENT}` : `/${GERMAN_SEGMENT}${bare}`;
}

/**
 * The BCP 47 tag for <html lang>.
 *
 * French gets fr-CH rather than fr: the band is in Fribourg, and the tag is
 * what a screen reader picks a voice from.
 */
export function htmlLang(locale: Locale): string {
  return locale === "de-CH" ? "de-CH" : "fr-CH";
}

/**
 * The Intl tag for a date, a time or a number.
 *
 * ONE TAG PER LOCALE, and it took #161 to get here. French used to have two:
 * `fr-FR` for long dates and `fr-CH` for everything else, because those two
 * are NOT equivalent in the long form —
 *
 *   fr-FR  samedi 5 décembre 2026
 *   fr-CH  samedi, 5 décembre 2026
 *
 * — and every assertion on a rendered long date had been written against the
 * fr-FR form. So a `kind` parameter picked between them.
 *
 * The only caller of the long form was lib/date.ts's formatEventDate and
 * formatEventDateRange, which nothing rendered: the planning has gone through
 * events/formatEventWhen.ts since #154. Deleting them left `kind` with nothing
 * to choose, so it went too.
 *
 * WHAT TO DO IF A LONG DATE COMES BACK. The comma above is real and it is a
 * French copy change, not a formatting detail — do not "tidy" French onto one
 * tag to fix a German bug. Bring the parameter back rather than switching this
 * return value, and note that a long-date formatter also needs a `timeZone`:
 * the absence of one is what made lib/date.ts carry a parseLocalDate helper,
 * and after #161 nothing in the app omits it.
 *
 * French gets fr-CH rather than fr: the band is in Fribourg, and Swiss French
 * renders a numeric date as 05.12.2026, which is also what de-CH renders.
 */
export function intlTag(locale: Locale): string {
  return locale === "de-CH" ? "de-CH" : "fr-CH";
}
