import { afterEach, expect, test } from "vitest";

import { currentLocale, roleHint, roleLabel, setLocale, t, translateApiError } from "./index";

test("a known code becomes French", () => {
  const result = translateApiError({ code: "invalid_credentials", fields: [] });
  expect(result.message).toBe("Nom d'utilisateur ou mot de passe incorrect");
});

test("a field error pairs the French label with the French reason", () => {
  const result = translateApiError({
    code: "validation_failed",
    fields: [{ field: "startTime", reason: "required" }],
  });
  expect(result.fields).toEqual([
    { field: "startTime", message: "Heure de début est obligatoire" },
  ]);
});

test("interpolation params reach the reason", () => {
  const result = translateApiError({
    code: "validation_failed",
    fields: [{ field: "title", reason: "too_long", params: { max: 120 } }],
  });
  expect(result.fields[0]?.message).toBe("Titre est trop long (maximum 120 caractères)");
});

test("an unknown code falls back rather than leaking the token", () => {
  const result = translateApiError({ code: "some_new_code", fields: [] });
  expect(result.message).toBe("Une erreur est survenue. Veuillez réessayer.");
});

test("an unknown field name keeps the raw field but still falls back on the reason", () => {
  const result = translateApiError({
    code: "validation_failed",
    fields: [{ field: "nope", reason: "alsoNope" }],
  });
  expect(result.fields).toEqual([
    { field: "nope", message: "nope Une erreur est survenue. Veuillez réessayer." },
  ]);
});

test("resolves an indexed array field to its label rather than leaking the identifier", () => {
  // Laravel reports an array element as `roleIds.0`. ApiErrorVocabularyTest
  // covers the copy; this pins the lookup from the display side.
  const translated = translateApiError({
    code: "validation_failed",
    fields: [{ field: "roleIds.0", reason: "invalid_type" }],
  });

  // The precise path survives for highlighting; the message carries the label.
  expect(translated.fields).toEqual([{ field: "roleIds.0", message: "Rôles a un type invalide" }]);
});

test("resolves a nested field to its last segment rather than leaking the identifier", () => {
  // POST /events/series nests the event under `template`. The catalogue has
  // no `fields.template.endTime`, since the words are those of a bare
  // `endTime`.
  const translated = translateApiError({
    code: "validation_failed",
    fields: [{ field: "template.endTime", reason: "must_be_after" }],
  });

  expect(translated.fields).toEqual([
    { field: "template.endTime", message: "Heure de fin doit être après le début" },
  ]);
});

// The reset restores the app's default, French.
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

test("the generic fallback is translated, so a German reader never meets French", async () => {
  await setLocale("de-CH");

  // `unknown_error` is minted client-side by web/src/api/http.ts for any
  // non-JSON error response (a 502 from the host, TEST/QA's HTML Basic-Auth
  // 401), so ApiErrorVocabularyTest cannot see it.
  expect(translateApiError({ code: "unknown_error", fields: [] }).message).toBe(
    "Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.",
  );

  // Same for an unknown field reason, which takes the other fallback path.
  expect(
    translateApiError({
      code: "validation_failed",
      fields: [{ field: "title", reason: "no_such_reason" }],
    }).fields[0]?.message,
  ).toBe("Titel Ein Fehler ist aufgetreten. Bitte versuchen Sie es erneut.");
});
