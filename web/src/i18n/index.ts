import i18next from "i18next";

import type { ApiError, ApiErrorField } from "../api/http";
import { de } from "./de";
import { fr } from "./fr";
import { DEFAULT_LOCALE, type Locale, localeFromPath } from "./locale";

/**
 * Initialised at module scope. ES module imports are hoisted, so an
 * i18next.init() in main.tsx would run after every imported module body.
 *
 * So every screen translates at render time, never at module scope: a
 * module-level `const NAV = [{ label: t(...) }]` is frozen in the locale active
 * at import, and a later setLocale() does not move it.
 *
 * The locale comes from the URL (locale.ts). In jsdom the location is
 * "http://localhost/", so tests start French.
 */
const initial =
  typeof window === "undefined" ? DEFAULT_LOCALE : localeFromPath(window.location.pathname).locale;

i18next.init({
  lng: initial,
  // A safety net: de.ts is typed `typeof fr`, so key parity is enforced at
  // build time, and a miss renders French rather than its lookup path.
  fallbackLng: DEFAULT_LOCALE,
  resources: {
    fr: { translation: fr },
    "de-CH": { translation: de },
  },
  interpolation: {
    // This concerns interpolated values ({{max}}, {{n}} and the like), never
    // the catalogue string. React already escapes on render, so escaping here
    // too would double-encode.
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
 * For tests only. In the browser a person changes language by navigating
 * (see pathInLocale), because `basename` is fixed when the router mounts.
 */
export async function setLocale(locale: Locale): Promise<void> {
  await i18next.changeLanguage(locale);
}

/**
 * Every leaf key path in the catalogue, as a union of string literals.
 *
 * An untyped `t("nav.jion")` renders the raw lookup path on screen, since
 * i18next returns the key on a miss. Deriving the union from `fr` (which `de`
 * mirrors) turns every such typo into a build failure.
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
 * A plural family's two entries, as the one key a caller may pass.
 *
 * i18next spells a plural as sibling keys, `thing_one` and `thing_other`, and
 * picks one from the `count` option by the active language's CLDR rule. Both
 * collapse to `thing` here, so neither suffixed form typechecks: a caller
 * reaching for `_one` has decided the plural rule in JavaScript, and the rules
 * differ. French counts 0 as singular ("0 réponse"), German does not
 * ("0 Rückmeldungen"), so `n === 1 ? a : b` is wrong in one of them.
 *
 * Only `_one`/`_other` are mapped, the only two categories French and Swiss
 * German have. A language with `_few` or `_many` needs this widened, and
 * fails at the call site until it is.
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
 * lifetime, so there is nothing to re-render, and react-i18next stays out of
 * the dependencies.
 */
export function t(key: TranslationKey, params?: Record<string, unknown>): string {
  return i18next.t(key, params ?? {}) as string;
}

/**
 * The sentence shown when a code or reason has no copy at all.
 *
 * Resolved at call time, never hoisted into a const, so it follows the locale.
 * http.ts mints `unknown_error` client-side for any non-JSON error response,
 * which no server-side guard can watch.
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
 * The only place where an API response becomes readable text: `code` and
 * `fields[].reason` are English tokens, never shown raw. An unknown token
 * falls back to a translated generic message rather than leaking an English
 * identifier or the i18next key a miss returns.
 */
export function translateApiError(error: Pick<ApiError, "code" | "fields">): TranslatedError {
  const fields = error.fields.map((entry: ApiErrorField) => {
    // Laravel reports an array element as `roleIds.0`, so the index is
    // stripped before the lookup, or the label falls back to the raw English
    // identifier. entry.field keeps its index in the returned object, so the
    // UI can highlight the right input.
    const lookupField = entry.field.replace(/\.\d+(?=\.|$)/g, "");
    const fieldKey = `fields.${lookupField}`;
    // A nested path falls back to its last segment: POST /events/series
    // reports `template.endTime`, whose label is the same as a bare
    // `endTime`'s. The full path is tried first, so a nested field can still
    // get words of its own.
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
 * A role's catalogue name, resolved from its `key`.
 *
 * A seeded role's name is system text a developer chose, so the catalogue
 * translates its key; the names a committee types are content (roleName
 * below, ADR 0026).
 *
 * An unknown key falls back to the key itself rather than to i18next's miss,
 * which would print the lookup path ("roles.whatever.label").
 */
export function roleLabel(key: string): string {
  const path = `roles.${key}.label`;
  return i18next.exists(path) ? i18next.t(path) : key;
}

/**
 * An event tag's name on the current page. The committee typed it, so it is
 * data rather than catalogue copy (ADR 0026): German when there is a German
 * name, the French one otherwise.
 */
export function tagLabel(tag: { labelFr: string; labelDe: string | null }): string {
  return currentLocale() === "fr" ? tag.labelFr : (tag.labelDe ?? tag.labelFr);
}

/**
 * A register's name on the current page. Typed by the committee, so
 * data rather than catalogue copy, with the same fallback as tagLabel: German
 * when there is a German name, the French one otherwise.
 */
export function registerName(name: string, nameDe: string | null | undefined): string {
  return currentLocale() === "fr" ? name : (nameDe ?? name);
}

/** The one-line explanation of what a role grants. Empty when there is none. */
export function roleHint(key: string): string {
  const path = `roles.${key}.hint`;
  return i18next.exists(path) ? i18next.t(path) : "";
}

/** A role as every response names it: by key, with the names the committee typed. */
type NamedRole = { key: string; labelFr: string | null; labelDe: string | null };

/**
 * A role's name on the current page.
 *
 * What the committee typed in the role editor, in this page's language or
 * the other one (ADR 0026, the same fallback as tagLabel); otherwise the
 * catalogue's translation of the key, which is every seeded role nobody has
 * renamed.
 */
export function roleName(role: NamedRole): string {
  const typed =
    currentLocale() === "fr" ? (role.labelFr ?? role.labelDe) : (role.labelDe ?? role.labelFr);
  return typed ?? roleLabel(role.key);
}

/**
 * A role's name in each language, for the editor's two fields: the typed
 * names where there are any, the catalogue's otherwise. Reads both catalogues
 * whatever the page's language, so renaming a seeded role from a French page
 * keeps its German name.
 */
export function roleNamesForEditing(role: NamedRole): { fr: string; de: string } {
  if (role.labelFr !== null || role.labelDe !== null) {
    return { fr: role.labelFr ?? "", de: role.labelDe ?? "" };
  }
  const path = `roles.${role.key}.label`;
  const inLocale = (lng: Locale) =>
    i18next.exists(path, { lng }) ? i18next.t(path, { lng }) : role.key;
  return { fr: inLocale("fr"), de: inLocale("de-CH") };
}

/**
 * What a role is for, in one line: the catalogue's hint for a seeded role, and
 * for a role made in the editor, which has none, the names of what it grants.
 */
export function roleDescription(role: { key: string; permissions: string[] }): string {
  return roleHint(role.key) || role.permissions.map(permissionLabel).join(", ");
}

/**
 * A permission's name and hint, for the role editor's checkboxes. The
 * catalogue keys the tokens with `_` for `.`, because i18next reads a dot as
 * a level: `permissions.events.manage` would look for a `manage` inside an
 * `events` that does not exist. A token with no copy shows itself, like an
 * unknown role key.
 */
export function permissionLabel(token: string): string {
  const path = `permissions.${token.replace(".", "_")}.label`;
  return i18next.exists(path) ? i18next.t(path) : token;
}

export function permissionHint(token: string): string {
  const path = `permissions.${token.replace(".", "_")}.hint`;
  return i18next.exists(path) ? i18next.t(path) : "";
}
