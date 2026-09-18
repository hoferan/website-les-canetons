import { LOCALES, type Locale } from "./locale";

export const LOCALE_STORAGE_KEY = "lescanetons.locale";

/**
 * The last locale somebody explicitly chose with the switcher.
 *
 * READ IN EXACTLY ONE PLACE: main.tsx, for a visit to the bare root. It NEVER
 * overrides the URL. If it did, a /de/agenda link sent to a German-speaking
 * friend could render French because their browser remembered a preference —
 * which is the whole reason prefixed URLs were chosen over a client-side
 * preference in the first place.
 *
 * There is deliberately no fallback to navigator.language: a francophone
 * band's home page should not silently become German because a visitor's
 * laptop is set to German, and auto-redirecting the root harms indexing of the
 * French site.
 */
export function storedLocale(): Locale | null {
  try {
    const raw = window.localStorage.getItem(LOCALE_STORAGE_KEY);

    return LOCALES.includes(raw as Locale) ? (raw as Locale) : null;
  } catch {
    // Private windows, blocked site data, and embedded webviews all throw
    // rather than returning null. A missing preference is not an error.
    return null;
  }
}

export function rememberLocale(locale: Locale): void {
  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Nothing to do and nothing worth telling anybody: the locale still
    // changes, it just is not remembered for next time.
  }
}
