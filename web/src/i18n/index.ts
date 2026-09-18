import i18next from "i18next";

import type { ApiError, ApiErrorField } from "../api/http";
import { de } from "./de";
import { fr } from "./fr";
import { DEFAULT_LOCALE, type Locale, localeFromPath } from "./locale";

const FALLBACK = "Une erreur est survenue. Veuillez réessayer.";

/**
 * INITIALISED AT MODULE SCOPE, AND IT HAS TO BE.
 *
 * ES module imports are hoisted: main.tsx's own statements run AFTER every
 * module it imports has been evaluated. An i18next.init() in main.tsx would
 * therefore run after Layout.tsx's module body, and anything that module read
 * at import time would have been resolved against an uninitialised i18next.
 *
 * The corollary is a rule every screen has to follow: TRANSLATE AT RENDER
 * TIME, NEVER AT MODULE SCOPE. A module-level `const NAV = [{ label: t(...) }]`
 * is frozen in whatever locale was active when the file was imported, so a
 * later setLocale() does not move it — a bug that shows up only in tests.
 *
 * The locale comes from the URL because the URL is the only authority on it;
 * see locale.ts. In jsdom, document.location is "http://localhost/", so tests
 * start French — which is what keeps all 39 existing test files passing
 * unchanged.
 */
const initial =
  typeof window === "undefined" ? DEFAULT_LOCALE : localeFromPath(window.location.pathname).locale;

i18next.init({
  lng: initial,
  // French is the fallback, so a key German has not reached yet renders French
  // rather than printing its own lookup path. Key parity is enforced at build
  // time by de.ts being typed `typeof fr`, so this is a safety net rather than
  // the mechanism.
  fallbackLng: DEFAULT_LOCALE,
  resources: {
    fr: { translation: fr },
    "de-CH": { translation: de },
  },
  interpolation: {
    // React escapes on render; i18next escaping again turns an apostrophe in
    // "Nom d'utilisateur" into &#39; on screen.
    escapeValue: false,
  },
});

/** The locale the app is currently rendering in. */
export function currentLocale(): Locale {
  return (i18next.language as Locale) ?? DEFAULT_LOCALE;
}

/**
 * Switch locale.
 *
 * FOR TESTS AND FOR THE BOOT PATH ONLY. In the browser a person changes
 * language by navigating (see pathInLocale), because `basename` is fixed when
 * the router mounts — so nothing in the running app calls this to re-render.
 */
export async function setLocale(locale: Locale): Promise<void> {
  await i18next.changeLanguage(locale);
}

/**
 * One translated string.
 *
 * A plain function rather than a hook: locale is constant for a page's
 * lifetime, so there is nothing for a hook's re-render machinery to do, and
 * this keeps react-i18next out of the dependency list.
 */
export function t(key: string, params?: Record<string, unknown>): string {
  return i18next.t(key, params ?? {}) as string;
}

export type TranslatedError = {
  message: string;
  fields: { field: string; message: string }[];
};

/**
 * Turns the API's machine tokens into French.
 *
 * This is the ONLY place in the system where French is computed from an API
 * response: `code` and `fields[].reason` are stable English tokens and are
 * never shown raw. An unknown token falls back to a generic message rather than
 * leaking an English identifier — or an i18next key, which is what i18next
 * itself returns on a miss — onto a French screen.
 */
export function translateApiError(error: Pick<ApiError, "code" | "fields">): TranslatedError {
  const fields = error.fields.map((entry: ApiErrorField) => {
    // Laravel reports an array element as `roleIds.0`, not `roleIds`, so the
    // index is stripped before the lookup. Without this the key misses and the
    // fallback prints the RAW ENGLISH IDENTIFIER on a French screen — exactly
    // the silent leak this module exists to prevent, and exactly what
    // ApiErrorVocabularyTest caught when roleIds.* first appeared.
    //
    // entry.field keeps its index in the returned object: the label is for a
    // human, but the UI needs the precise path to highlight the right input.
    const lookupField = entry.field.replace(/\.\d+(?=\.|$)/g, "");
    const fieldKey = `fields.${lookupField}`;
    // A NESTED path falls back to its last segment. POST /api/events/series
    // takes its event under a `template` object, so Laravel reports
    // `template.endTime` — and the French label for that is "Heure de fin",
    // exactly as it is for a bare `endTime`. Trying the full path first keeps
    // the override available for the day two parents need different words for
    // the same leaf; without the fallback every nested field would have to be
    // spelled out twice, and a miss prints the RAW ENGLISH IDENTIFIER on a
    // French screen. Same failure the index-stripping above prevents.
    const leafKey = `fields.${lookupField.split(".").pop() ?? lookupField}`;
    const label = i18next.exists(fieldKey)
      ? i18next.t(fieldKey)
      : i18next.exists(leafKey)
        ? i18next.t(leafKey)
        : entry.field;
    const reasonKey = `validation.${entry.reason}`;
    const reason = i18next.exists(reasonKey) ? i18next.t(reasonKey, entry.params ?? {}) : FALLBACK;
    return { field: entry.field, message: `${label} ${reason}` };
  });

  const codeKey = `errors.${error.code}`;
  return {
    message: i18next.exists(codeKey) ? i18next.t(codeKey) : FALLBACK,
    fields,
  };
}

/**
 * A role's French name and help text, resolved from its `key`.
 *
 * The API carries NO display name (decision B6): it is English without
 * exception, and a seeded role's name is system text a developer chose in a
 * migration rather than something a user typed. `key` is the fixed identifier,
 * and this is the only place it becomes French — the same rule
 * translateApiError follows for error tokens.
 *
 * An unknown key falls back to the key itself rather than to i18next's miss
 * behaviour, which returns the lookup path ("roles.whatever.label") and would
 * print that on screen. A key with no copy is a role somebody added by hand in
 * the database; showing its key is honest and legible, and it is what the
 * deferred role editor replaces.
 */
export function roleLabel(key: string): string {
  const path = `roles.${key}.label`;
  return i18next.exists(path) ? i18next.t(path) : key;
}

/** The one-line explanation of what a role grants. Empty when there is none. */
export function roleHint(key: string): string {
  const path = `roles.${key}.hint`;
  return i18next.exists(path) ? i18next.t(path) : "";
}
