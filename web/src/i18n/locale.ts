/**
 * Which locale a URL is in, and where the router should be mounted for it.
 *
 * No React and no router here: unit tests mount a memory router, which never
 * exercises `basename`, so locale resolution must be testable without one.
 *
 * The URL is the only authority on locale. Nothing here reads localStorage or
 * navigator.language: a stored preference overriding the URL would render a
 * /de/agenda link in French for whoever it was sent to.
 */

export type Locale = "fr" | "de-CH";

export const LOCALES: readonly Locale[] = ["fr", "de-CH"];

/** French is unprefixed, so it is also what an unrecognised path resolves to. */
export const DEFAULT_LOCALE: Locale = "fr";

/** The URL segment. Short on purpose: there is only one German variant. */
export const GERMAN_SEGMENT = "de";

/**
 * Matched as a whole segment, never as a string prefix:
 * `pathname.startsWith("/de")` would claim /design and /details and mount the
 * router at /de, which renders a blank page.
 */
const GERMAN_PATH = new RegExp(`^/${GERMAN_SEGMENT}(?=/|$)`);

/**
 * Where the SPA is mounted, with no trailing slash.
 *
 * Empty on every server, which serve it from the document root. A PR preview
 * serves it from `/website-les-canetons/pr-<n>/` on GitHub Pages (#353), and
 * Vite's `base` sets BASE_URL to that. The prefix comes off before the locale
 * is read and goes back on every path handed to the router or the browser.
 */
export const APP_BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

/** The path inside the app: the same pathname with the base taken off. */
export function pathInApp(pathname: string, base: string = APP_BASE): string {
  if (!base) return pathname;
  if (pathname === base) return "/";

  return pathname.startsWith(`${base}/`) ? pathname.slice(base.length) : pathname;
}

export function localeFromPath(
  pathname: string,
  base: string = APP_BASE,
): { locale: Locale; basename: string } {
  return GERMAN_PATH.test(pathInApp(pathname, base))
    ? { locale: "de-CH", basename: `${base}/${GERMAN_SEGMENT}` }
    : { locale: DEFAULT_LOCALE, basename: base || "/" };
}

/**
 * The same page in another locale, as an origin-absolute path.
 *
 * Takes and returns a full pathname, prefix included, for
 * `window.location.assign`. Switching locale is a real navigation, because
 * `basename` is fixed when the router mounts, so each locale boots clean with
 * no stale i18next state.
 */
export function pathInLocale(pathname: string, target: Locale, base: string = APP_BASE): string {
  const bare = pathInApp(pathname, base).replace(GERMAN_PATH, "") || "/";

  if (target === DEFAULT_LOCALE) {
    return `${base}${bare}`;
  }

  return bare === "/" ? `${base}/${GERMAN_SEGMENT}` : `${base}/${GERMAN_SEGMENT}${bare}`;
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
 * One tag per locale. The two French tags differ in the long weekday form:
 *
 *   fr-FR  samedi 5 décembre 2026
 *   fr-CH  samedi, 5 décembre 2026
 *
 * That comma is a French copy change. If a long date with a weekday comes
 * back, add a parameter rather than switching this return value, and give the
 * formatter a `timeZone` like every other date formatter in the app.
 *
 * French gets fr-CH rather than fr: the band is in Fribourg, and Swiss French
 * renders a numeric date as 05.12.2026, which is also what de-CH renders.
 */
export function intlTag(locale: Locale): string {
  return locale === "de-CH" ? "de-CH" : "fr-CH";
}
