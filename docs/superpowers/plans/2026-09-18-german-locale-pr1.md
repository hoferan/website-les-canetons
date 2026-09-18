# German Locale — PR 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the SPA able to render in Swiss Standard German at `/de/*`, with the complete translation catalogue, locale-aware date formatting, and the nav chrome translated as the worked example — without changing a single byte of French output.

**Architecture:** A pure `localeFromPath()` resolves locale and router basename from `window.location.pathname`. `web/src/i18n/index.ts` initialises i18next at module scope (before any component module body runs) with `fr` and `de-CH` resources. `App.tsx` passes the basename to `BrowserRouter`, which transparently re-prefixes every existing `<Link>` and `navigate()`. A new `de.ts`, typed `typeof fr`, makes key parity a compile error.

**Tech Stack:** React 19, TypeScript, Vite 8, react-router-dom v6, i18next ^26.3.6 (no `react-i18next`), Vitest, Playwright, Laravel 13 / PHPUnit for the vocabulary guard.

**Spec:** `docs/superpowers/specs/2026-09-18-german-locale-design.md`

**Issue:** [#151](https://github.com/hoferan/website-les-canetons/issues/151). The PR closes it, and also closes [#147](https://github.com/hoferan/website-les-canetons/issues/147) (Task 5). Slices 2–9 are #152–#159.

## Global Constraints

- **French output must stay byte-identical.** All 39 existing web test files and 3 e2e specs must pass unchanged. If a French string changes, the change is wrong.
- **`LONG` in `date.ts` keeps `fr-FR` for French; instant formatters keep `fr-CH` for French.** `fr-FR` renders `samedi 5 décembre 2026`, `fr-CH` renders `samedi, 5 décembre 2026` — they are not interchangeable. Preserve the existing inconsistency; do not tidy it.
- **German is `de-CH`, Swiss Standard German, formal *Sie* throughout. Never `ß` — always `ss`.**
- **The URL segment is `/de`; the i18next language and `<html lang>` are `de-CH`.**
- **Translate at render time, never at module scope.** No module-level constant may hold translated text or a locale-bound `Intl` formatter.
- **`fr.ts` must keep bare identifier keys and no TypeScript syntax inside the object literal** — `ApiErrorVocabularyTest.php` regex-matches and brace-walks it. The same applies to `de.ts`.
- **Prefix the UI only, never the API.** `/api/v1` and `/sanctum/csrf-cookie` stay at the origin root.
- **The built artifact does not move.** `vite.config.ts` keeps `base: "/"`; `/assets/*` stays at the origin root; no `.htaccess` change.
- Run `npm run test:web` from PowerShell, never Git Bash (Vitest 4 drive-letter bug). In this web session, run it directly.
- Commit after every task.

---

### Task 1: `localeFromPath` — locale and basename from a pathname

**Files:**
- Create: `web/src/i18n/locale.ts`
- Test: `web/src/i18n/locale.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `type Locale = "fr" | "de-CH"`
  - `const LOCALES: readonly Locale[]`
  - `const DEFAULT_LOCALE: Locale` (`"fr"`)
  - `const GERMAN_SEGMENT = "de"`
  - `localeFromPath(pathname: string): { locale: Locale; basename: string }`
  - `pathInLocale(pathname: string, target: Locale): string`
  - `htmlLang(locale: Locale): string`
  - `intlTag(locale: Locale, kind: "long" | "instant"): string`

- [ ] **Step 1: Write the failing test**

Create `web/src/i18n/locale.test.ts`:

```ts
import { describe, expect, test } from "vitest";

import { htmlLang, intlTag, localeFromPath, pathInLocale } from "./locale";

describe("localeFromPath", () => {
  test("an unprefixed path is French, mounted at the root", () => {
    expect(localeFromPath("/agenda")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("/")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("")).toEqual({ locale: "fr", basename: "/" });
  });

  test("a /de-prefixed path is German, mounted at /de", () => {
    expect(localeFromPath("/de/agenda")).toEqual({ locale: "de-CH", basename: "/de" });
    expect(localeFromPath("/de/events/12/attendance")).toEqual({
      locale: "de-CH",
      basename: "/de",
    });
  });

  test("the bare /de root is German", () => {
    expect(localeFromPath("/de")).toEqual({ locale: "de-CH", basename: "/de" });
    expect(localeFromPath("/de/")).toEqual({ locale: "de-CH", basename: "/de" });
  });

  // THE TRAP THIS FUNCTION EXISTS TO AVOID. A prefix match on "/de" would
  // claim every one of these, mount the router at /de, and render nothing.
  test("matches /de as a whole segment, never as a string prefix", () => {
    expect(localeFromPath("/design")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("/depot")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("/demo/x")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("/details")).toEqual({ locale: "fr", basename: "/" });
  });

  test("is case-sensitive: /DE is not the German prefix", () => {
    expect(localeFromPath("/DE/agenda")).toEqual({ locale: "fr", basename: "/" });
  });
});

describe("pathInLocale", () => {
  test("adds the prefix when switching to German", () => {
    expect(pathInLocale("/agenda", "de-CH")).toBe("/de/agenda");
    expect(pathInLocale("/", "de-CH")).toBe("/de");
  });

  test("strips the prefix when switching to French", () => {
    expect(pathInLocale("/de/agenda", "fr")).toBe("/agenda");
    expect(pathInLocale("/de", "fr")).toBe("/");
  });

  test("is idempotent — translating to the locale a path is already in changes nothing", () => {
    expect(pathInLocale("/de/agenda", "de-CH")).toBe("/de/agenda");
    expect(pathInLocale("/agenda", "fr")).toBe("/agenda");
  });
});

describe("htmlLang and intlTag", () => {
  test("html lang is the full tag, including for French", () => {
    expect(htmlLang("fr")).toBe("fr-CH");
    expect(htmlLang("de-CH")).toBe("de-CH");
  });

  // PINS THE GLOBAL CONSTRAINT. fr-FR renders "samedi 5 décembre 2026" and
  // fr-CH renders "samedi, 5 décembre 2026" — a comma apart. Every existing
  // assertion on a long date was written against the fr-FR form.
  test("the long-date tag for French is fr-FR, preserving today's output", () => {
    expect(intlTag("fr", "long")).toBe("fr-FR");
    expect(intlTag("de-CH", "long")).toBe("de-CH");
  });

  test("the instant tag for French is fr-CH, preserving today's output", () => {
    expect(intlTag("fr", "instant")).toBe("fr-CH");
    expect(intlTag("de-CH", "instant")).toBe("de-CH");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run web/src/i18n/locale.test.ts`
Expected: FAIL — `Failed to resolve import "./locale"`.

- [ ] **Step 3: Write the implementation**

Create `web/src/i18n/locale.ts`:

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run web/src/i18n/locale.test.ts`
Expected: PASS — 11 tests.

- [ ] **Step 5: Commit**

```bash
git add web/src/i18n/locale.ts web/src/i18n/locale.test.ts
git commit -m "feat(web): resolve locale and router basename from the pathname"
```

---

### Task 2: The German catalogue

**Files:**
- Create: `web/src/i18n/de.ts`
- Test: `web/src/i18n/catalogues.test.ts`

**Interfaces:**
- Consumes: `fr` from `web/src/i18n/fr.ts`.
- Produces: `export const de: typeof fr` — every key of `fr`, same shape, German values.

**Why the whole catalogue and not just the errors:** `typeof fr` demands every key or the build fails. Typing `de` as a partial would give up compile-time parity, which is the cheapest guarantee in this design.

- [ ] **Step 1: Write the failing parity test**

Create `web/src/i18n/catalogues.test.ts`:

```ts
import { expect, test } from "vitest";

import { de } from "./de";
import { fr } from "./fr";

/** Every leaf key path in an object, dotted, sorted. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

/**
 * TypeScript already fails the build on a missing or extra key, because de.ts
 * is declared `typeof fr`. This runs anyway, because a deep structural TS
 * error on a 250-line nested object is close to unreadable, and this prints
 * the offending paths.
 */
test("the two catalogues carry exactly the same keys", () => {
  const french = keyPaths(fr);
  const german = keyPaths(de);

  expect(german.filter((k) => !french.includes(k))).toEqual([]);
  expect(french.filter((k) => !german.includes(k))).toEqual([]);
});

/*
 * THERE IS DELIBERATELY NO "every German value differs from its French one"
 * TEST HERE.
 *
 * It was written and removed. Several values are legitimately identical in both
 * languages — "Adresse", "Option", "Galerie", "Team Direction" — so the test
 * only passes against an allowlist of them, and that allowlist has to grow with
 * every slice PR. api/tests/Feature/ApiErrorVocabularyTest.php argues the same
 * point at length about its own deleted KNOWN_GAPS constant: an exemption list
 * is an invitation to add the next entry.
 *
 * The failure it was reaching for — French pasted into de.ts and left there —
 * is caught by the German rendering assertions each slice adds beside its
 * French ones, which is where a human is already reading the copy.
 */

test("German uses ss, never the German-German eszett", () => {
  const offenders = keyPaths(de).filter((path) => {
    const value = path
      .split(".")
      .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], de);
    return typeof value === "string" && value.includes("ß");
  });

  expect(offenders).toEqual([]);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/i18n/catalogues.test.ts`
Expected: FAIL — `Failed to resolve import "./de"`.

- [ ] **Step 3: Write the catalogue**

Create `web/src/i18n/de.ts`. It mirrors `fr.ts` key for key.

```ts
import { fr } from "./fr";

/**
 * The Swiss Standard German vocabulary, mirroring fr.ts key for key.
 *
 * TYPED `typeof fr` ON PURPOSE. A missing or extra key is then a build error,
 * which is the cheapest parity guarantee available and costs nothing to
 * maintain. web/src/i18n/catalogues.test.ts prints the offending paths, because
 * a deep structural TS error on this shape is close to unreadable.
 *
 * THE SAME PARSING RULES AS fr.ts APPLY. api/tests/Feature/
 * ApiErrorVocabularyTest.php reads this file too: keys must stay BARE
 * IDENTIFIERS and the object literal must stay free of TypeScript syntax. The
 * `: typeof fr` annotation sits outside the braces and is fine.
 *
 * SWISS STANDARD GERMAN: `ss` and never `ß`. Formal `Sie` throughout, mirroring
 * the French, which is `vous` even in the members' area — so every string here
 * is a 1:1 translation of its French counterpart and the two stay mechanically
 * comparable.
 */
export const de: typeof fr = {
  roles: {
    direction: {
      // Not translated: the band's own name for the group, as in the French.
      label: "Team Direction",
      hint: "Organisiert die Anlässe, verwaltet die Mitglieder und sieht die Rückmeldungen.",
    },
    committee: {
      label: "Vorstand",
      hint: "Sieht die Anmeldeliste ein.",
    },
  },

  errors: {
    validation_failed: "Das Formular enthält Fehler.",
    method_not_allowed: "Methode nicht erlaubt",
    not_authenticated: "Nicht angemeldet",
    access_denied: "Zugriff verweigert",
    invalid_credentials: "Benutzername oder Passwort ist falsch",
    too_many_attempts: "Zu viele Versuche. Bitte versuchen Sie es später erneut.",
    reauth_failed: "Falsches Passwort. Diese Aktion muss mit Ihrem Passwort bestätigt werden.",
    cannot_delete_self: "Sie können Ihr eigenes Konto nicht löschen.",
    cannot_demote_self: "Sie können sich Ihre eigenen Administrationsrechte nicht entziehen.",
    cannot_remove_last_administrator:
      "Das ist die letzte Person, die Mitglieder verwalten kann.",
    // Sagt, was zu tun ist, ohne die Regel zu erklären: ein vom Vorstand
    // ausgegebenes Passwort wurde mündlich mitgeteilt, ein «Wechsel» auf
    // dasselbe Passwort liesse das Konto also auf einem bereits gehörten.
    password_unchanged: "Das ist bereits Ihr aktuelles Passwort. Wählen Sie ein anderes.",

    invalid_session: "Ungültige Sitzung",
    // Eine Anfrage, die keine Sitzung eröffnen kann: ein erneuter Versuch
    // bringt nichts, anders als bei invalid_session.
    stateful_request_required: "Diese Anfrage kann keine Sitzung eröffnen.",
    rate_limited: "Zu viele Anfragen. Bitte warten Sie, bevor Sie es erneut versuchen.",
    service_unavailable: "Dienst nicht verfügbar",

    idempotency_key_required:
      "Dieses Formular konnte nicht gesendet werden. Laden Sie die Seite neu.",
    idempotency_key_invalid:
      "Dieses Formular konnte nicht gesendet werden. Laden Sie die Seite neu.",
    idempotency_key_reuse:
      "Senden läuft bereits. Warten Sie einen Moment, bevor Sie es erneut versuchen.",

    if_match_required: "Diese Änderung konnte nicht überprüft werden. Laden Sie die Seite neu.",
    if_match_failed:
      "Jemand hat diesen Eintrag inzwischen geändert. Laden Sie neu, um die Änderungen zu sehen, und versuchen Sie es dann erneut.",

    not_answerable: "Sie gehören keinem Register an: Von Ihnen wird keine Rückmeldung erwartet.",
    cannot_record_for_self:
      "Für sich selbst antworten Sie über die Planung: Eine zurückgezogene Zusage benötigt eine Begründung.",
    answer_already_settled: "Diese Frist ist abgelaufen. Ändern Sie Ihre Antwort, statt sie zurückzuziehen.",
    spam_suspected: "Senden abgelehnt. Laden Sie die Seite neu und versuchen Sie es erneut.",
    registration_not_open: "Die Anmeldung ist noch nicht geöffnet.",
    registration_closed: "Die Anmeldung ist geschlossen.",
    option_has_registrations:
      "Eine bereits gebuchte Option kann nicht gelöscht werden. Stornieren Sie zuerst die betroffenen Anmeldungen.",
    xlsx_unavailable:
      "Der Excel-Export ist auf diesem Server nicht verfügbar. Verwenden Sie das CSV-Format.",
    not_found: "Nicht gefunden",
  },

  validation: {
    required: "ist erforderlich",
    too_long: "ist zu lang (maximal {{max}} Zeichen)",
    invalid_format: "hat kein gültiges Format",
    invalid_type: "hat einen ungültigen Typ",
    invalid_value: "muss einer der folgenden Werte sein: {{allowed}}",
    already_taken: "ist bereits vergeben",
    too_short: "ist zu kurz (mindestens {{min}} Zeichen)",
    invalid_number: "ist keine gültige Zahl",
    must_be_after: "muss nach dem Beginn liegen",
    // PARAMETERLOS, wie im Französischen: die Obergrenze kommt aus einem
    // Closure-Validator, der nur `field` und `reason` liefert — ein
    // interpoliertes {{max}} würde wörtlich auf dem Bildschirm stehen.
    too_many_guests: "überschreitet die pro Anmeldung zulässige Personenzahl",
  },

  fields: {
    date: "Datum",
    title: "Titel",
    startsAt: "Beginn",
    endsAt: "Ende",
    startTime: "Startzeit",
    endTime: "Endzeit",
    location: "Ort",
    attire: "Kleidung",
    weekend: "Wochenende",
    isPublic: "Öffentlich sichtbar",
    notes: "Bemerkungen",
    registrationOpensAt: "Anmeldebeginn",
    registrationClosesAt: "Anmeldeschluss",
    registrationMaxGuests: "Personen pro Anmeldung",
    sectionId: "Register",
    committeeFunctionId: "Funktion im Vorstand",
    instructorOfSectionId: "Registerleitung",
    publicVisible: "Öffentlich sichtbar",
    roleIds: "Rollen",
    currentPassword: "Aktuelles Passwort",
    newPassword: "Neues Passwort",
    id: "Benutzername",
    lastName: "Nachname",
    firstName: "Vorname",
    email: "E-Mail",
    subject: "Betreff",
    message: "Nachricht",
    handled: "Erledigt",
    first_name: "Vorname",
    last_name: "Nachname",
    address: "Adresse",
    phone: "Telefon",
    table_name: "Tisch",
    menus: "Menüs",
    username: "Benutzername",
    password: "Passwort",
    eventId: "Anlass",
    participation: "Teilnahme",
    dates: "Termine",
    template: "Vorlage",
    status: "Antwort",
    note: "Begründung",
    tableName: "Tisch",
    choices: "Auswahl",
    optionId: "Option",
    quantity: "Anzahl",
    options: "Optionen",
    label: "Bezeichnung",
    description: "Beschreibung",
    priceCents: "Preis",
    sortOrder: "Reihenfolge",
  },

  contactMessages: {
    heading: "Nachrichten",
    messageWord: "Nachricht",
    messagesWord: "Nachrichten",
    countFiltered: "{visible} von {total} {word}",
    filterAll: "Alle",
    filterOpen: "Offen",
    filterHandled: "Erledigt",
    openStatus: "Offen",
    handledStatus: "Erledigt",
    read: "Lesen",
    close: "Schliessen",
    handle: "Als erledigt markieren",
    reopen: "Wieder öffnen",
    delete: "Löschen",
    deleteConfirmTitle: "Diese Nachricht löschen?",
    deleteConfirmDescription:
      "Die Nachricht von {name} wird endgültig gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.",
    handledBy: "Erledigt von {name}, am {date}",
    // DER NORMALFALL, KEIN FEHLER: ein leerer Posteingang ist eine gute
    // Nachricht.
    empty: "Noch keine Nachrichten. Das Kontaktformular ist bereit.",
    emptyFiltered: "Keine Nachricht entspricht diesem Filter.",
    loadError: "Die Nachrichtenliste konnte nicht geladen werden.",
    readError: "Diese Nachricht konnte nicht geladen werden. Laden Sie die Seite neu.",
  },

  inbox: {
    heading: "Posteingang",
    kinds: {
      contactMessage: "Nachricht von der Website",
    },
    empty: "Nichts wartet auf eine Antwort. Der Posteingang ist aktuell.",
    loadError: "Der Posteingang konnte nicht geladen werden.",
  },
};
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run web/src/i18n/catalogues.test.ts && npx tsc --noEmit`
Expected: PASS — 2 tests; `tsc` exits 0.

If `tsc` reports a missing or extra key, fix `de.ts` — `fr.ts` is the authority and must not be edited to satisfy it.

- [ ] **Step 5: Commit**

```bash
git add web/src/i18n/de.ts web/src/i18n/catalogues.test.ts
git commit -m "feat(web): add the Swiss Standard German catalogue"
```

---

### Task 3: Wire i18next for two locales, and expose `t`

**Files:**
- Modify: `web/src/i18n/index.ts` (the `i18next.init` block at the top, lines 1-13)
- Modify: `web/src/test/renderWithSession.tsx`
- Test: `web/src/i18n/index.test.ts` (append; do not alter existing tests)

**Interfaces:**
- Consumes: `localeFromPath`, `Locale` (Task 1); `de` (Task 2).
- Produces:
  - `t(key: string, params?: Record<string, unknown>): string`
  - `setLocale(locale: Locale): Promise<void>`
  - `currentLocale(): Locale`
  - `renderWithSession(ui, { route?, state?, locale? })`

- [ ] **Step 1: Write the failing test**

Append to `web/src/i18n/index.test.ts`:

```ts
import { afterEach } from "vitest";

import { currentLocale, setLocale, t } from "./index";

// Every test in this file below runs in French unless it says otherwise, and
// the app's default is French, so the reset restores the shared default rather
// than a value this file chose.
afterEach(async () => {
  await setLocale("fr");
});

test("the default locale is French", () => {
  expect(currentLocale()).toBe("fr");
});

test("t resolves a key in the active locale", async () => {
  expect(t("errors.access_denied")).toBe("Accès refusé");

  await setLocale("de-CH");

  expect(currentLocale()).toBe("de-CH");
  expect(t("errors.access_denied")).toBe("Zugriff verweigert");
});

test("t interpolates params", async () => {
  await setLocale("de-CH");
  expect(t("validation.too_long", { max: 120 })).toBe("ist zu lang (maximal 120 Zeichen)");
});

test("translateApiError follows the active locale", async () => {
  await setLocale("de-CH");

  const result = translateApiError({
    code: "validation_failed",
    fields: [{ field: "startTime", reason: "required" }],
  });

  expect(result.message).toBe("Das Formular enthält Fehler.");
  expect(result.fields).toEqual([{ field: "startTime", message: "Startzeit ist erforderlich" }]);
});

test("roleLabel and roleHint follow the active locale", async () => {
  await setLocale("de-CH");
  expect(roleLabel("committee")).toBe("Vorstand");
  expect(roleHint("committee")).toBe("Sieht die Anmeldeliste ein.");
});
```

Add `roleLabel, roleHint` to the existing `import { translateApiError } from "./index";` line at the top of the file.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/i18n/index.test.ts`
Expected: FAIL — `t is not exported` / `setLocale is not exported`.

- [ ] **Step 3: Replace the init block in `web/src/i18n/index.ts`**

Replace lines 1-13 (the imports and the `i18next.init({...})` call) with:

```ts
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
```

Leave `translateApiError`, `roleLabel` and `roleHint` below it exactly as they are — they already call `i18next.t` and therefore follow the active locale with no change.

- [ ] **Step 4: Teach the test helper about locale**

In `web/src/test/renderWithSession.tsx`, add the import and extend the signature:

```ts
import { type Locale } from "../i18n/locale";
import { setLocale } from "../i18n";
```

Change the signature and add the switch before `render`:

```ts
export async function renderWithSession(
  ui: ReactNode,
  {
    route = "/",
    state,
    locale = "fr",
  }: { route?: string; state?: unknown; locale?: Locale } = {},
) {
  // DEFAULTS TO FRENCH so that every existing test renders exactly what it
  // rendered before this parameter existed. Awaited rather than fired: i18next
  // resolves synchronously with preloaded resources, but changeLanguage is
  // promise-returning and an unawaited one would race the first render.
  await setLocale(locale);

  const queryClient = new QueryClient({
```

- [ ] **Step 5: Reset locale between tests**

In `web/src/setupTests.ts`, change the existing `afterEach(() => {` to `afterEach(async () => {`, and add after `resetMockState();`:

```ts
  // A test that rendered in German otherwise leaks that locale into the next
  // one, which then fails only when the whole file runs and passes in
  // isolation — the same shape of false flakiness vi.restoreAllMocks() below
  // exists to prevent.
  //
  // AWAITED, not fired and forgotten: changeLanguage returns a promise, and an
  // unawaited one can settle after the next test's first render, which is the
  // very race this reset exists to close.
  await setLocale("fr");
```

and add the import at the top: `import { setLocale } from "./i18n";`

- [ ] **Step 6: Run the full web suite**

Run: `npx vitest run`
Expected: PASS — every existing file green, plus the new i18n tests. If any French assertion fails, the locale reset is not working; fix that rather than the assertion.

- [ ] **Step 7: Commit**

```bash
git add web/src/i18n/index.ts web/src/i18n/index.test.ts web/src/test/renderWithSession.tsx web/src/setupTests.ts
git commit -m "feat(web): initialise i18next for fr and de-CH, and export t()"
```

---

### Task 4: The PHP vocabulary guard reads both catalogues

**Files:**
- Modify: `api/tests/Feature/ApiErrorVocabularyTest.php` — `I18N_PATHS` (≈line 56), `assertVocabularyCovered()`, `i18nSource()`

**Interfaces:**
- Consumes: `web/src/i18n/de.ts` (Task 2).
- Produces: nothing for other tasks; this is a guard.

**Why:** a shipped locale whose errors silently fall back to French is a half-feature, and this test exists precisely to stop wrong-language text reaching a screen.

- [ ] **Step 1: Make the path list per-locale**

Replace the `I18N_PATHS` constant and its docblock with:

```php
    /**
     * Candidate locations of each locale's vocabulary, because the two layouts
     * differ.
     *
     * In the repository tree — a developer's checkout and CI — it sits at
     * <root>/web/src/i18n/<locale>.ts, three levels up from this file. In the
     * dev container the document root is the BUILT artifact, which contains
     * only hashed bundles, so the source is not reachable from _api/ at all;
     * docker-compose.yml mounts the tracked web/ read-only at /srv/web purely
     * so this guard can still read it. The suite runs with a -w of
     * /var/www/html/_api, so neither cwd nor one absolute path would do.
     *
     * (api/app/ needs no such list: this file sits inside api/, so ../../app is
     * the same relative path in both layouts.)
     */
    private const I18N_DIRS = [
        __DIR__.'/../../../web/src/i18n',
        '/srv/web/src/i18n',
    ];

    /**
     * Every locale the SPA ships, each of which must carry copy for every token.
     *
     * GERMAN IS NOT OPTIONAL HERE. de-CH is a shipped locale, and i18next's
     * fallbackLng would quietly render a French error message to a German
     * reader for any token nobody translated — silent, and exactly the class of
     * bug this file exists to make mechanical.
     */
    private const LOCALES = ['fr', 'de'];
```

- [ ] **Step 2: Loop the assertion over both locales**

Replace the body of `assertVocabularyCovered()` with:

```php
    private function assertVocabularyCovered(string $label, string $section, array $tokens): void
    {
        foreach (self::LOCALES as $locale) {
            $existing = $this->i18nKeys($section, $locale);

            $missing = array_values(array_diff($tokens, $existing));

            self::assertSame([], $missing, sprintf(
                "web/src/i18n/%s.ts is missing copy for %d %s token(s) the API can emit:\n  - %s\n\n"
                ."Each belongs under the `%s:` section of the exported `%s` object.\n"
                .'Without it translateApiError() degrades silently — a missing code or reason '
                ."becomes the generic fallback sentence, a missing field name puts the raw\n"
                .'English identifier on the screen.',
                $locale,
                count($missing),
                $label,
                implode("\n  - ", array_map(fn ($t) => "{$section}.{$t}", $missing)),
                $section,
                $locale
            ));
        }
    }
```

- [ ] **Step 3: Thread the locale through the reader**

Change `i18nKeys()`'s signature and its call to `i18nSource()`:

```php
    private function i18nKeys(string $section, string $locale): array
    {
        $source = $this->blankNonCode($this->i18nSource($locale));
```

and inside it, change the two failure messages from `fr.ts` to `{$locale}.ts`:

```php
            self::fail(
                "{$locale}.ts has no `{$section}:` section, so the API's tokens for it cannot be checked at all. "
                .'If the section was renamed, update this test to match.'
            );
```

```php
        self::assertNotNull($end, "Unbalanced braces while reading {$locale}.ts's `{$section}:` section.");
```

```php
        self::assertNotEmpty($keys[1], "{$locale}.ts's `{$section}:` section parsed as empty; this reader is broken.");
```

Replace `i18nSource()` with:

```php
    private function i18nSource(string $locale): string
    {
        foreach (self::I18N_DIRS as $dir) {
            $path = "{$dir}/{$locale}.ts";

            if (is_file($path)) {
                return (string) file_get_contents($path);
            }
        }

        // Fail loudly rather than skip: a silently-skipped vocabulary guard
        // reports green while checking nothing, which is worse than not having
        // it — the untranslated-token bugs it exists to catch are themselves
        // silent.
        self::fail(
            "Cannot find web/src/i18n/{$locale}.ts, so the API's error vocabulary is unchecked for that locale. "
            ."Looked in:\n  - ".implode("\n  - ", self::I18N_DIRS)
            ."\nIf the files moved, update ApiErrorVocabularyTest::I18N_DIRS."
        );
    }
```

- [ ] **Step 4: Run the guard**

Run: `npm run test:api -- --filter=ApiErrorVocabularyTest`
Expected: PASS — 7 tests. The brace-walk must cope with `export const de: typeof fr = {`; the annotation sits outside the braces and `blankNonCode` leaves it alone, but if the section regex fails the test says so by name rather than passing vacuously.

- [ ] **Step 5: Prove the guard actually bites**

Temporarily delete the `not_found` line from `web/src/i18n/de.ts` and re-run.
Expected: FAIL naming `errors.not_found` and `de.ts`. Restore the line and re-run to green.

This step is not optional: `CLAUDE.md` warns that assertions in this project have passed against nothing before.

- [ ] **Step 6: Commit**

```bash
git add api/tests/Feature/ApiErrorVocabularyTest.php
git commit -m "test(api): require German copy for every emittable token"
```

---

### Task 5: Locale-aware dates, and #147's duplicate formatters

**Files:**
- Modify: `web/src/lib/date.ts`
- Modify: `web/src/pages/Inbox.tsx:9-21` (remove `ARRIVED` / `formatArrived`)
- Modify: `web/src/pages/ContactMessages.tsx:35-47` (remove `RECEIVED` / `formatReceived`)
- Modify: `web/src/i18n/fr.ts` and `web/src/i18n/de.ts` (add a `dates` section)
- Test: `web/src/lib/date.test.ts`

**Interfaces:**
- Consumes: `currentLocale`, `t` (Task 3); `intlTag` (Task 1).
- Produces: `formatInstant(iso: string): string` — replaces both `formatArrived` and `formatReceived`. `formatEventDate`, `formatEventDateRange`, `formatTime`, `formatLastLogin` keep their signatures.

Closes [#147](https://github.com/hoferan/website-les-canetons/issues/147).

- [ ] **Step 1: Add the range separator to both catalogues**

In `web/src/i18n/fr.ts`, add a new section immediately before `contactMessages`:

```ts
  /**
   * Words that live inside date helpers rather than on a screen.
   *
   * `rangeSeparator` joins the two days of a weekend event in
   * formatEventDateRange. It was a hard-coded " au " inside web/src/lib/date.ts
   * — a translatable string hiding in a formatter, which is exactly where one
   * gets missed.
   */
  dates: {
    rangeSeparator: " au ",
  },
```

In `web/src/i18n/de.ts`, add the mirror in the same position:

```ts
  dates: {
    rangeSeparator: " bis ",
  },
```

- [ ] **Step 2: Write the failing test**

Create `web/src/lib/date.test.ts`:

```ts
import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import {
  formatEventDate,
  formatEventDateRange,
  formatInstant,
  formatLastLogin,
  formatTime,
} from "./date";

afterEach(async () => {
  await setLocale("fr");
});

// THE REGRESSION GUARD FOR THE WHOLE PR. Every one of these is what the app
// renders today; if any changes, French output has moved and something is
// wrong.
test("French output is exactly what it was before the locale existed", () => {
  expect(formatEventDate("2026-12-05")).toBe("samedi 5 décembre 2026");
  expect(formatEventDateRange("2026-12-05")).toBe("samedi 5 décembre 2026 au dimanche 6 décembre 2026");
  expect(formatTime("19:00:00")).toBe("19:00");
  expect(formatInstant("2026-09-15T10:05:00Z")).toBe("15 septembre 2026 à 12:05");
  expect(formatLastLogin("2026-09-15T10:05:00Z")).toBe("15 septembre 2026");
});

test("German renders in de-CH", async () => {
  await setLocale("de-CH");

  expect(formatEventDate("2026-12-05")).toBe("Samstag, 5. Dezember 2026");
  expect(formatEventDateRange("2026-12-05")).toBe(
    "Samstag, 5. Dezember 2026 bis Sonntag, 6. Dezember 2026",
  );
  expect(formatInstant("2026-09-15T10:05:00Z")).toBe("15. September 2026 um 12:05");
  expect(formatLastLogin("2026-09-15T10:05:00Z")).toBe("15. September 2026");
});

// PINS THE TIMEZONE. The API sends UTC and an evening login in Fribourg is the
// previous day in UTC; formatted in the viewer's zone this would also differ
// between two committee members reading the same roster.
test("instants are pinned to Europe/Zurich, not the viewer's zone", () => {
  expect(formatInstant("2026-01-15T23:30:00Z")).toBe("16 janvier 2026 à 00:30");
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run web/src/lib/date.test.ts`
Expected: FAIL — `formatInstant` is not exported.

- [ ] **Step 4: Rewrite `web/src/lib/date.ts`**

Replace the `LONG` constant and the `LAST_LOGIN` constant with locale-keyed caches, and add `formatInstant`:

```ts
import { currentLocale, t } from "../i18n";
import { intlTag, type Locale } from "../i18n/locale";

/**
 * FORMATTERS ARE BUILT ON DEMAND AND CACHED PER LOCALE, never held in a
 * module-level const.
 *
 * A module-scope `new Intl.DateTimeFormat(...)` is bound to whatever locale was
 * active when this file was first imported, and a later locale change does not
 * move it. Building on demand is also cheap — Intl caches internally — and a
 * small map keeps it to one construction per locale per shape.
 */
/**
 * The three date shapes this app renders, each with the Intl tag family it
 * belongs to.
 *
 * KEYED BY SHAPE, NOT BY TAG FAMILY. `instant` and `lastLogin` both resolve to
 * fr-CH in French, so a cache keyed on the tag alone would hand the
 * time-bearing formatter to formatLastLogin or the other way round, depending
 * only on which was called first. That is a bug that passes in isolation and
 * fails when the whole file runs.
 */
const SHAPES = {
  long: {
    kind: "long",
    options: { weekday: "long", year: "numeric", month: "long", day: "numeric" },
  },
  instant: {
    kind: "instant",
    options: {
      timeZone: "Europe/Zurich",
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    },
  },
  lastLogin: {
    // `instant` as a TAG FAMILY: last-login has always formatted with fr-CH
    // like the other instants, even though its shape drops the time of day.
    // Only the long-date shape uses fr-FR.
    kind: "instant",
    options: { timeZone: "Europe/Zurich", day: "numeric", month: "long", year: "numeric" },
  },
} as const satisfies Record<string, { kind: "long" | "instant"; options: Intl.DateTimeFormatOptions }>;

type Shape = keyof typeof SHAPES;

const cache = new Map<string, Intl.DateTimeFormat>();

function formatter(shape: Shape): Intl.DateTimeFormat {
  const locale: Locale = currentLocale();
  const { kind, options } = SHAPES[shape];
  const tag = intlTag(locale, kind);
  const key = `${tag}|${shape}`;

  let found = cache.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(tag, options);
    cache.set(key, found);
  }

  return found;
}
```

Keep `parseLocalDate` exactly as it is. Then:

```ts
export function formatEventDate(iso: string): string {
  return formatter("long").format(parseLocalDate(iso));
}

/** A weekend event spans the given day and the next. */
export function formatEventDateRange(iso: string): string {
  const start = parseLocalDate(iso);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  const long = formatter("long");

  return `${long.format(start)}${t("dates.rangeSeparator")}${long.format(end)}`;
}
```

`formatTime` is unchanged. Replace the `LAST_LOGIN` block's formatter call, keeping its existing docblock:

```ts
export function formatLastLogin(iso: string): string {
  return formatter("lastLogin").format(new Date(iso));
}
```

Add the new shared function, with an accurate docblock:

```ts
/**
 * An instant as a date and a time: "15 septembre 2026 à 12:05", or
 * "15. September 2026 um 12:05".
 *
 * ONE FUNCTION FOR TWO SCREENS (#147). Inbox.tsx and ContactMessages.tsx each
 * held a byte-identical private copy of this — same options, same docblock,
 * differing only in the name (`formatArrived` / `formatReceived`). Both
 * screens' tests assert the rendered string, so the French output here is
 * exactly what those two produced.
 *
 * (Both of those docblocks claimed the output was "le 15 septembre 2026,
 * 12:05". It never was — there is no leading "le" and the separator is "à".
 * The stale text was not carried forward.)
 *
 * DISTINCT FROM formatLastLogin, which drops the time of day. A contact
 * message is a worklist item whose minute matters; a last login is read as
 * "recently or not". #147 says so explicitly and it is easy to collapse by
 * mistake.
 */
export function formatInstant(iso: string): string {
  return formatter("instant").format(new Date(iso));
}
```

- [ ] **Step 5: Point both screens at it**

In `web/src/pages/Inbox.tsx`, delete lines 9-21 (the `ARRIVED` const and `formatArrived`), add `formatInstant` to the existing import from `../lib/date`, and replace every `formatArrived(` call with `formatInstant(`.

In `web/src/pages/ContactMessages.tsx`, delete lines 35-47 (the `RECEIVED` const and `formatReceived`), add `formatInstant` to the import from `../lib/date`, and replace every `formatReceived(` call with `formatInstant(`.

Run `grep -rn "formatArrived\|formatReceived" web/src` and expect no matches.

- [ ] **Step 6: Run the suite**

Run: `npx vitest run web/src/lib/date.test.ts web/src/pages/Inbox.test.tsx web/src/pages/ContactMessages.test.tsx`
Expected: PASS. `Inbox.test.tsx` and `ContactMessages.test.tsx` assert the rendered date strings and must pass **unmodified** — if either fails, the French output moved and the formatter is wrong.

Then: `npx vitest run`
Expected: PASS, whole suite.

- [ ] **Step 7: Commit**

```bash
git add web/src/lib/date.ts web/src/lib/date.test.ts web/src/pages/Inbox.tsx web/src/pages/ContactMessages.tsx web/src/i18n/fr.ts web/src/i18n/de.ts
git commit -m "refactor(web): one locale-aware instant formatter for both screens

Closes #147."
```

---

### Task 6: Mount the router under the locale, and set `<html lang>`

**Files:**
- Modify: `web/src/App.tsx`
- Modify: `web/src/main.tsx`
- Create: `web/src/i18n/preference.ts`
- Test: `web/src/i18n/preference.test.ts`

**Interfaces:**
- Consumes: `localeFromPath`, `htmlLang`, `pathInLocale`, `Locale`, `DEFAULT_LOCALE` (Task 1).
- Produces:
  - `storedLocale(): Locale | null`
  - `rememberLocale(locale: Locale): void`
  - `LOCALE_STORAGE_KEY = "lescanetons.locale"`

- [ ] **Step 1: Write the failing test**

Create `web/src/i18n/preference.test.ts`:

```ts
import { afterEach, expect, test } from "vitest";

import { LOCALE_STORAGE_KEY, rememberLocale, storedLocale } from "./preference";

afterEach(() => {
  window.localStorage.clear();
});

test("nothing stored reads as no preference", () => {
  expect(storedLocale()).toBeNull();
});

test("a remembered locale reads back", () => {
  rememberLocale("de-CH");
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("de-CH");
  expect(storedLocale()).toBe("de-CH");
});

// A value written by an older build, by a different app on the same origin, or
// by hand. It must not become a basename.
test("an unrecognised stored value reads as no preference", () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "klingon");
  expect(storedLocale()).toBeNull();
});

test("storage being unavailable is not an error", () => {
  const getItem = Storage.prototype.getItem;
  Storage.prototype.getItem = () => {
    throw new Error("SecurityError: access denied");
  };

  expect(storedLocale()).toBeNull();

  Storage.prototype.getItem = getItem;
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/i18n/preference.test.ts`
Expected: FAIL — `Failed to resolve import "./preference"`.

- [ ] **Step 3: Write it**

Create `web/src/i18n/preference.ts`:

```ts
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
```

- [ ] **Step 4: Make `App.tsx` take the basename**

Replace `web/src/App.tsx` entirely:

```tsx
import { BrowserRouter } from "react-router-dom";

import { AppRoutes } from "./routes";

/**
 * `basename` is what makes the locale prefix cost nothing at the call sites.
 *
 * Every existing <Link to="/agenda"> and navigate("/events") resolves under it
 * automatically, and useLocation() hands back a pathname with it already
 * stripped — so the guards that compare a pathname to a literal ("/account" in
 * MustChangePassword) keep matching without being touched.
 *
 * DERIVED FROM THE URL BY THE CALLER, never hardcoded. A literal "/de" here
 * would break every test that renders <App /> in jsdom (document URL
 * "http://localhost/") and all nine Playwright page.goto() call sites, because
 * React Router renders nothing when the URL does not begin with the basename.
 * French is unprefixed, so passing "/" is the status quo.
 */
export default function App({ basename = "/" }: { basename?: string }) {
  return (
    <BrowserRouter basename={basename}>
      <AppRoutes />
    </BrowserRouter>
  );
}
```

- [ ] **Step 5: Resolve the locale in `main.tsx`**

In `web/src/main.tsx`, add to the imports:

```ts
import { htmlLang, localeFromPath, pathInLocale } from "./i18n/locale";
import { storedLocale } from "./i18n/preference";
```

Immediately after the MSW block and before `const root = ...`, insert:

```ts
// THE ONE PLACE A STORED PREFERENCE IS READ, and only for the bare root.
// Everywhere else the URL is the authority. Replace rather than assign, so the
// French root does not sit in the back-stack as a place to return to.
//
// This cannot loop: /de resolves to German and its pathname is no longer "/".
if (window.location.pathname === "/" && storedLocale() === "de-CH") {
  window.location.replace(`${pathInLocale("/", "de-CH")}${window.location.search}${window.location.hash}`);
}

const { locale, basename } = localeFromPath(window.location.pathname);

// The shell ships <html lang="fr">, which is right for the majority and for a
// crawler that runs no JavaScript. This corrects it for the German mount, and
// is what a screen reader picks its voice from.
document.documentElement.lang = htmlLang(locale);
```

Change the render call to pass the basename:

```tsx
        <SessionProvider>
          <App basename={basename} />
        </SessionProvider>
```

- [ ] **Step 6: Run the suite and the typecheck**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. `App.test.tsx` renders `<App />` with no prop, so it gets `basename="/"` and behaves exactly as before.

- [ ] **Step 7: Commit**

```bash
git add web/src/App.tsx web/src/main.tsx web/src/i18n/preference.ts web/src/i18n/preference.test.ts
git commit -m "feat(web): mount the router under the locale prefix"
```

---

### Task 7: Fix the one navigation that escapes the router

**Files:**
- Modify: `web/src/session/LogoutButton.tsx` (the `leave()` function at the bottom, and its docblock)
- Modify: `web/src/components/ButtonLink.tsx` (docblock only)
- Create: `web/src/session/logoutDestination.test.ts`

**Interfaces:**
- Consumes: `pathInLocale`, `currentLocale` (Tasks 1 and 3).
- Produces: `logoutDestination(): string`, exported from `web/src/session/LogoutButton.tsx`.

**READ THIS BEFORE WRITING THE TEST — `window.location` CANNOT BE SPIED ON HERE.**

`web/src/components/Layout.test.tsx:128-135` already documents the constraint,
having hit it:

> The browser half — landing on `/` — is a full page load, which jsdom does not
> perform and cannot be faked here: `window.location` is non-configurable, so
> the spy that would watch it throws "Cannot redefine property: assign".

So `vi.spyOn(window.location, "assign")` throws rather than asserting anything.
The existing suite works around it by testing only the server half ("ends the
session on the server") and leaving the landing to a real browser.

**`LogoutButton.tsx`'s own docblock contradicts that and is wrong.** It claims
"spying on it is how Layout.test.tsx asserts that logging out actually leaves".
Layout.test.tsx says the opposite, at length. Correct the docblock in this task
— it is three lines from the code being changed, and leaving a false claim
beside a fix is how the next person wastes an afternoon.

**The testable seam** is therefore the destination, not the navigation: extract
`logoutDestination()` and unit-test it in both locales. The navigation itself
stays proven in a real browser, as it is today.

**Why only this one:** the basename audit found that `useLocation()` is already basename-stripped, so `MustChangePassword`, `ScrollToTop`, `guards.tsx` and `Layout`'s active-state matching need no change. `returnTo.ts` is a closed router loop and `download.ts` never touches the router. This is the single escape.

- [ ] **Step 1: Write the failing test**

Create `web/src/session/logoutDestination.test.ts`:

```ts
import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { logoutDestination } from "./LogoutButton";

afterEach(async () => {
  await setLocale("fr");
});

/**
 * THE DESTINATION IS THE SEAM, because the navigation is not testable here:
 * window.location is non-configurable in this jsdom setup, so a spy on
 * .assign throws "Cannot redefine property: assign" rather than recording
 * anything. Layout.test.tsx:128-135 documents that, having hit it. The
 * navigation itself is proven in a real browser.
 */
test("logging out in French lands on the site root", () => {
  expect(logoutDestination()).toBe("/");
});

test("logging out in German lands on the German root, not the French one", async () => {
  await setLocale("de-CH");

  expect(logoutDestination()).toBe("/de");
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run web/src/session/logoutDestination.test.ts`
Expected: FAIL — `logoutDestination` is not exported from `./LogoutButton`.

- [ ] **Step 3: Make `leave()` locale-aware**

In `web/src/session/LogoutButton.tsx`, add the imports:

```ts
import { currentLocale } from "../i18n";
import { pathInLocale } from "../i18n/locale";
```

and replace `leave()` with an exported destination plus the navigation:

```ts
/**
 * Where logging out lands: the CURRENT LOCALE'S root, not "/".
 *
 * EXPORTED SO IT CAN BE TESTED AT ALL. The navigation below cannot be: this is
 * a real full page load, and window.location is non-configurable in this jsdom
 * setup, so a spy on .assign throws "Cannot redefine property: assign" instead
 * of recording the call. Layout.test.tsx:128-135 documents that, having hit it,
 * and proves the server half only. Splitting the destination out gives the
 * decision a unit test and leaves the landing to a real browser, which is
 * where it was always checked.
 *
 * (An earlier version of this file's docblock claimed Layout.test.tsx spied on
 * assign. It never did, and never could.)
 *
 * THE LOCALE MATTERS because this escapes the router's basename entirely — the
 * one place in web/src/ that does. A literal "/" would drop a German member on
 * the French home page, silently changing their language as a side effect of
 * logging out.
 */
export function logoutDestination(): string {
  return pathInLocale("/", currentLocale());
}

/** Closes the phone menu, then hands the browser back to the public site. */
function leave(onDone: () => void): void {
  onDone();
  window.location.assign(logoutDestination());
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run web/src/session/logoutDestination.test.ts web/src/components/Layout.test.tsx`
Expected: PASS — the two new destination tests, and `Layout.test.tsx` unchanged and still green.

- [ ] **Step 5: Warn the next person in `ButtonLink`**

In `web/src/components/ButtonLink.tsx`, add to the component docblock:

```
 * THE `external` BRANCH EMITS A RAW <a href>, which the router never sees — so
 * it does NOT get the locale basename. No call site passes it an app-internal
 * path today, and none should: an internal destination belongs in the <Link>
 * branch, or it silently leaves the visitor's locale behind.
```

- [ ] **Step 6: Commit**

```bash
git add web/src/session/LogoutButton.tsx web/src/session/logoutDestination.test.ts web/src/components/ButtonLink.tsx
git commit -m "fix(web): log out to the locale's own root rather than /"
```

---

### Task 8: Translate the nav chrome — the worked example

**Files:**
- Modify: `web/src/components/Layout.tsx`
- Modify: `web/src/session/LogoutButton.tsx` (the button's label)
- Modify: `web/src/i18n/fr.ts` and `web/src/i18n/de.ts` (a `nav` section)
- Test: `web/src/components/Layout.test.tsx`

**Interfaces:**
- Consumes: `t` (Task 3).
- Produces: the pattern PRs 2–8 copy — `labelKey` on the data, `t()` at render.

- [ ] **Step 1: Add the `nav` section to both catalogues**

In `web/src/i18n/fr.ts`, immediately after the `dates` section added in Task 5:

```ts
  /**
   * The chrome: the nav, its accessible names, and the footer.
   *
   * The nav arrays in Layout.tsx carry a `labelKey` into this section rather
   * than a label. A module-level `label: t(...)` would be frozen in whatever
   * locale was active when that module was imported — see the initialisation
   * note in ./index.ts.
   */
  nav: {
    primary: "Navigation principale",
    menu: "Menu",
    menuLabel: "Menu de navigation",
    join: "Nous rejoindre",
    agenda: "Où nous voir",
    band: "Les canetons",
    committee: "Comité",
    history: "Histoire",
    contact: "Contact",
    events: "Événements",
    members: "Membres",
    inbox: "Boîte de réception",
    gallery: "Galerie",
    login: "Connexion",
    logout: "Déconnexion",
    // The inbox badge's accessible name. {{n}} is i18next interpolation,
    // unlike contactMessages' {name}, which the component replaces by hand.
    //
    // `n` RATHER THAN `count`, and that is not a style choice: i18next treats a
    // `count` option as a PLURAL SELECTOR and looks for `pending_one` /
    // `pending_other` before falling back. Naming the variable anything else
    // keeps it a plain interpolation.
    pending: "{{n}} en attente",
    rights: "Tous droits réservés.",
  },
```

In `web/src/i18n/de.ts`, the mirror:

```ts
  nav: {
    primary: "Hauptnavigation",
    menu: "Menü",
    menuLabel: "Navigationsmenü",
    join: "Mitmachen",
    agenda: "Wo wir spielen",
    band: "Die Canetons",
    committee: "Vorstand",
    history: "Geschichte",
    contact: "Kontakt",
    events: "Anlässe",
    members: "Mitglieder",
    inbox: "Posteingang",
    gallery: "Galerie",
    login: "Anmelden",
    logout: "Abmelden",
    pending: "{{n}} ausstehend",
    rights: "Alle Rechte vorbehalten.",
  },
```

`nav.contact` and `nav.gallery` are identical in both languages, which is correct and needs no annotation anywhere — see the note in `catalogues.test.ts` on why there is no "must differ" test.

- [ ] **Step 2: Write the failing test**

Append to `web/src/components/Layout.test.tsx`:

```ts
test("the nav renders in German under the German locale", async () => {
  await renderWithSession(<Layout />, { locale: "de-CH" });

  expect(screen.getByRole("navigation", { name: "Hauptnavigation" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Mitmachen" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Wo wir spielen" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Anmelden" })).toBeInTheDocument();
  expect(screen.getByText(/Alle Rechte vorbehalten\./)).toBeInTheDocument();
});

test("the nav is still French by default", async () => {
  await renderWithSession(<Layout />);

  expect(screen.getByRole("navigation", { name: "Navigation principale" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Nous rejoindre" })).toBeInTheDocument();
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npx vitest run web/src/components/Layout.test.tsx`
Expected: FAIL — German nav test cannot find `Hauptnavigation`.

- [ ] **Step 4: Convert `Layout.tsx` from `label` to `labelKey`**

Change the three nav arrays to carry keys:

```ts
const NAV: Array<{ to: string; labelKey: string }> = [
  { to: "/join", labelKey: "nav.join" },
  { to: "/agenda", labelKey: "nav.agenda" },
  { to: "/band", labelKey: "nav.band" },
  { to: "/committee", labelKey: "nav.committee" },
  { to: "/history", labelKey: "nav.history" },
  { to: "/contact", labelKey: "nav.contact" },
];

const DIRECTION_NAV: Array<{ to: string; labelKey: string; permission: string }> = [
  { to: "/members", labelKey: "nav.members", permission: "members.manage" },
  { to: "/inbox", labelKey: "nav.inbox", permission: "messages.view" },
];

const MEMBER_NAV: Array<{ to: string; labelKey: string }> = [
  { to: "/events", labelKey: "nav.events" },
];
```

Add to the imports: `import { t } from "../i18n";`

Change `NavItem`'s prop from `label: string` to `labelKey: string` and render `{t(labelKey)}` in place of `{label}`.

At each of the three `.map(` call sites, replace `label={item.label}` with `labelKey={item.labelKey}`.

Replace the remaining literals:

- `aria-label="Navigation principale"` → `aria-label={t("nav.primary")}`
- `aria-label="Menu de navigation"` → `aria-label={t("nav.menuLabel")}`
- the button's text `Menu` → `{t("nav.menu")}`
- `Galerie` in the Flickr anchor → `{t("nav.gallery")}`
- `aria-label={`${inboxTotal} en attente`}` → `aria-label={t("nav.pending", { n: inboxTotal })}`
- `{user ? user.username : "Connexion"}` → `{user ? user.username : t("nav.login")}`
- the footer's `Tous droits réservés.` → `{t("nav.rights")}`

Leave the commented-out `/multimedia` block alone — it is dead code with its own note, and translating a comment is noise.

In `web/src/session/LogoutButton.tsx`, replace the button's `Déconnexion` text with `{t("nav.logout")}` and add `t` to the existing `../i18n` import added in Task 7.

- [ ] **Step 5: Run to verify it passes**

Run: `npx vitest run web/src/components/Layout.test.tsx`
Expected: PASS — including every pre-existing French assertion in that file, unmodified.

Then: `npx vitest run && npx tsc --noEmit`
Expected: PASS, whole suite.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Layout.tsx web/src/components/Layout.test.tsx web/src/session/LogoutButton.tsx web/src/i18n/fr.ts web/src/i18n/de.ts web/src/i18n/catalogues.test.ts
git commit -m "feat(web): translate the nav chrome, and set the pattern for the slices"
```

---

### Task 9: Correct the stale routing line in CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:** none.

`CLAUDE.md` describes `web/src/routes.tsx` as "the route table — French URLs, unchanged". The table is English, and `routes.tsx`'s own docblock says legacy French paths are not redirected. This file is loaded into every session, so a wrong line there costs every future reader.

- [ ] **Step 1: Find it**

Run: `grep -n "French URLs, unchanged" CLAUDE.md`
Expected: one hit, in the `web/` layout block.

- [ ] **Step 2: Correct it**

Replace `routes.tsx            the route table — French URLs, unchanged` with:

```
      routes.tsx            the route table — English URLs; /de/* is the German mount
```

- [ ] **Step 3: Verify nothing else repeats the claim**

Run: `grep -rn "French URL\|URLs français" CLAUDE.md docs/ staging/ 2>/dev/null`
Expected: no matches.

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: the route table is English, not French"
```

---

### Task 10: Full verification and the closing evidence

**Files:** none modified.

- [ ] **Step 1: Run the full check**

Run: `npm run check`
Expected: PASS. Note `lint:types` prints a skip notice in a web session — Larastan is not installed here and CI's `lint-api` job is the gate.

- [ ] **Step 2: Run the Laravel suite**

Run: `npm run test:api`
Expected: PASS. If the stack is not up, run `npm run websession:init` first.

- [ ] **Step 3: Capture the evidence the spec asks for**

Start the mocked dev server: `npm run dev:mock`

1. Open `/de/agenda`. The nav must read **Mitmachen / Wo wir spielen / Die Canetons / Vorstand / Geschichte / Kontakt**, with French page content beneath it — that mixture is the expected state until PRs 2–8 land, and it is worth showing.
2. In the console, confirm `document.documentElement.lang === "de-CH"`.
3. Open `/agenda` and confirm the nav is French and `lang === "fr-CH"`.
4. Open `/design` and confirm it renders the French 404 view, not a blank page — the whole-segment rule working.

- [ ] **Step 4: Push**

```bash
git push -u origin claude/new-session-kufjx5
```

---

## Notes for PRs 2–8 (#152–#158)

The pattern this PR establishes, in one paragraph, so each slice does not re-derive it:

Move each French literal into a new section of `fr.ts`, add the German mirror to `de.ts` in the same commit (`typeof fr` will not let you do otherwise), and call `t("section.key")` **at render time**. Data arrays carry a `labelKey`, never a label. Existing tests keep asserting French and must not be edited to accommodate the move; add a German assertion beside them. When a screen formats a date, use `web/src/lib/date.ts` — never a new `Intl.DateTimeFormat` at module scope.
