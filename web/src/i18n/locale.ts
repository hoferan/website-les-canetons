/**
 * Which locale a URL is in, and the path the route table sees for it.
 *
 * No React and no router here, so locale resolution is testable without one.
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
 * `pathname.startsWith("/de")` would claim /design and /details as German.
 */
const GERMAN_PATH = new RegExp(`^/${GERMAN_SEGMENT}(?=/|$)`);

/**
 * `/fr`, which opens the French page of the rest of the path. French URLs
 * have no prefix, so the address bar then drops it (`LocaleFromUrl`): one URL
 * per page, as search engines want, while a hand-typed `/fr/join` still works.
 */
const FRENCH_ALIAS = /^\/fr(?=\/|$)/;

/** Whether a path inside the app starts with the `/fr` alias. */
export function isFrenchAlias(path: string): boolean {
  return FRENCH_ALIAS.test(path);
}

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

/** The locale of a browser pathname, base included. */
export function localeFromPath(pathname: string, base: string = APP_BASE): Locale {
  return splitLocale(pathInApp(pathname, base)).locale;
}

/**
 * A path inside the app, as its locale and the path the route table matches:
 * `/de/agenda` is German `/agenda`, and `/de` is German `/`. The router is
 * mounted once for both languages (#369), so the route table never sees the
 * language segment. The `/fr` alias comes off the same way.
 */
export function splitLocale(path: string): { locale: Locale; path: string } {
  if (GERMAN_PATH.test(path)) {
    return { locale: "de-CH", path: path.replace(GERMAN_PATH, "") || "/" };
  }
  return { locale: DEFAULT_LOCALE, path: path.replace(FRENCH_ALIAS, "") || "/" };
}

/** A path the route table matches, as the app's path in `locale`: `splitLocale` undone. */
export function localizePath(path: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) return path;
  return path === "/" ? `/${GERMAN_SEGMENT}` : `/${GERMAN_SEGMENT}${path}`;
}

/**
 * The same page in another locale, as an origin-absolute path, base included:
 * for what leaves the router, such as `window.location` or an `hreflang` URL.
 * Inside the app, `Link` and `useNavigate` from routing.tsx add the prefix.
 */
export function pathInLocale(pathname: string, target: Locale, base: string = APP_BASE): string {
  return `${base}${localizePath(splitLocale(pathInApp(pathname, base)).path, target)}`;
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
