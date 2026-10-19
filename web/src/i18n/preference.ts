import { LOCALES, type Locale } from "./locale";

export const LOCALE_STORAGE_KEY = "lescanetons.locale";

/**
 * The last locale somebody explicitly chose with the switcher.
 *
 * Read in one place only, main.tsx, for a visit to the bare root. It never
 * overrides the URL, or a shared /de/agenda link could render in French.
 *
 * There is no fallback to navigator.language: the band's home page should not
 * turn German because a laptop is set to German, and auto-redirecting the
 * root harms indexing of the French site.
 */
export function storedLocale(): Locale | null {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);

    return LOCALES.includes(raw as Locale) ? (raw as Locale) : null;
  } catch {
    // Private windows, blocked site data and embedded webviews throw rather
    // than return null. A missing preference is not an error.
    return null;
  }
}

/**
 * Record an explicit switcher choice.
 *
 * The switcher must call this before it navigates. Switching to French from
 * /de lands on "/", and shouldRedirectToGerman() below would bounce straight
 * back to /de if the stored value were still "de-CH".
 */
export function rememberLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // The locale still changes; it is just not remembered.
  }
}

/**
 * Whether a visit should be bounced to the German mount.
 *
 * A pure function so it can be tested: main.tsx's boot navigates, and jsdom
 * implements no navigation (the same seam as logoutDestination()).
 *
 * Only the bare root. Everywhere else the URL decides.
 */
export function shouldRedirectToGerman(pathname: string, stored: Locale | null): boolean {
  return pathname === "/" && stored === "de-CH";
}
