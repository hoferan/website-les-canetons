import i18next from "i18next";

import type { ApiError, ApiErrorField } from "../api/http";
import { de } from "./de";
import { fr } from "./fr";
import { DEFAULT_LOCALE, type Locale, localeFromPath } from "./locale";

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
 * start French — which is what keeps every existing test file passing
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
    // i18next escapes INTERPOLATED VALUES only -- never the catalogue string
    // itself, so an apostrophe in "Nom d'utilisateur" is unaffected either
    // way. What this protects is {{max}}, {{min}}, {{allowed}} and {{n}}:
    // React already escapes on render, so letting i18next escape them too
    // would double-encode.
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
 * Every leaf key path in the catalogue, as a union of string literals.
 *
 * TYPED KEYS, BECAUSE THIS PATTERN GETS COPIED SEVEN MORE TIMES. An untyped
 * `t("nav.jion")` renders the raw lookup path on screen: i18next returns the
 * key on a miss, so there is no crash, no compile error and no lint error —
 * just "nav.jion" in the navigation bar. Deriving the union from `fr` (which
 * `de` already mirrors via `typeof fr`) turns every such typo into a build
 * failure, and PR 1 is the only cheap moment to do it.
 *
 * Leaves only: `Leaves<{nav: {join: string}}>` is `"nav.join"`, never `"nav"`,
 * because a section is not something t() can render.
 */
type Leaves<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string ? Unplural<K> : `${K}.${Leaves<T[K]>}`;
    }[keyof T & string];

/**
 * A plural family's two entries, as the ONE key a caller may pass.
 *
 * i18next spells a plural as two sibling keys, `thing_one` and `thing_other`,
 * and resolves between them from the `count` option using the ACTIVE
 * LANGUAGE's CLDR rule. Both collapse to `thing` here, so `t("x.thing")` is
 * what typechecks and neither suffixed form does — which is the point: a
 * caller who reaches for `_one` directly has decided the plural rule in
 * JavaScript, and the rules differ. French counts 0 as singular ("0 réponse")
 * and German does not ("0 Rückmeldungen"), so the `n === 1 ? a : b` this
 * replaced was wrong in one language whichever way it was written.
 *
 * Only `_one`/`_other` are mapped, because those are the only two categories
 * French and Swiss German have. A language with `_few` or `_many` — Polish,
 * Russian — needs this widened, and will fail loudly at the call site rather
 * than silently render the wrong form.
 */
type Unplural<K extends string> = K extends `${infer Base}_one`
  ? Base
  : K extends `${infer Base}_other`
    ? Base
    : K;

export type TranslationKey = Leaves<typeof fr>;

/**
 * One translated string.
 *
 * A plain function rather than a hook: locale is constant for a page's
 * lifetime, so there is nothing for a hook's re-render machinery to do, and
 * this keeps react-i18next out of the dependency list.
 */
export function t(key: TranslationKey, params?: Record<string, unknown>): string {
  return i18next.t(key, params ?? {}) as string;
}

/**
 * The sentence shown when a code or reason has no copy at all.
 *
 * RESOLVED AT CALL TIME, NOT HOISTED INTO A CONST. It used to be a module-scope
 * French string literal, which meant a German reader met a French sentence —
 * and by the one route no server-side guard can watch, since http.ts mints
 * `unknown_error` client-side for any non-JSON error response.
 */
function fallback(): string {
  return t("errors.generic");
}

export type TranslatedError = {
  message: string;
  fields: { field: string; message: string }[];
};

/**
 * Turns the API's machine tokens into the active locale.
 *
 * This is the ONLY place in the system where an API response becomes readable
 * text: `code` and `fields[].reason` are stable English tokens and are never
 * shown raw. An unknown token falls back to a generic message rather than
 * leaking an English identifier — or an i18next key, which is what i18next
 * itself returns on a miss — onto the screen. The fallback is itself
 * translated; see fallback() above for why that is not optional.
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
    const reason = i18next.exists(reasonKey)
      ? i18next.t(reasonKey, entry.params ?? {})
      : fallback();
    return { field: entry.field, message: `${label} ${reason}` };
  });

  const codeKey = `errors.${error.code}`;
  return {
    message: i18next.exists(codeKey) ? i18next.t(codeKey) : fallback(),
    fields,
  };
}

/**
 * A role's French name and help text, resolved from its `key`.
 *
 * The API carries NO display name (ADR 0014): it is English without
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
