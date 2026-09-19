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
 * The Intl tag for a date format, which is NOT always htmlLang().
 *
 * FRENCH KEEPS THE TAGS IT HAS TODAY, and that is load-bearing rather than
 * lazy. `date.ts` formats long dates with fr-FR and instants with fr-CH, and
 * for the long form those two are NOT equivalent:
 *
 *   fr-FR  samedi 5 décembre 2026
 *   fr-CH  samedi, 5 décembre 2026
 *
 * Every existing assertion on a rendered long date was written against the
 * fr-FR form, so "tidying" French onto one tag is a French copy change wearing
 * an i18n costume, and it would break tests in files this work has no other
 * reason to touch. German has no such history and uses de-CH throughout.
 *
 * (date.ts's own docblock does claim fr-FR and fr-CH are equivalent — but only
 * for the last-login option set, which omits the weekday. There it holds.)
 */
export function intlTag(locale: Locale, kind: "long" | "instant"): string {
  if (locale === "de-CH") {
    return "de-CH";
  }

  return kind === "long" ? "fr-FR" : "fr-CH";
}
