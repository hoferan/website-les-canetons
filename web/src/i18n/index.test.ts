import { expect, test } from "vitest";

import { translateApiError } from "./index";

test("a known code becomes French", () => {
  const result = translateApiError({ code: "invalid_credentials", fields: [] });
  expect(result.message).toBe("Nom d'utilisateur ou mot de passe incorrect");
});

test("a field error pairs the French label with the French reason", () => {
  const result = translateApiError({
    code: "validation_failed",
    fields: [{ field: "startTime", reason: "required" }],
  });
  expect(result.fields).toEqual([{ field: "startTime", message: "Heure de début est requis" }]);
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
  // Laravel reports an array element as `roleIds.0`. Before the index was
  // stripped, the lookup missed and the fallback printed the raw English
  // `roleIds.0` onto a French screen. ApiErrorVocabularyTest caught it; this
  // pins the behaviour from the display side.
  const translated = translateApiError({
    code: "validation_failed",
    fields: [{ field: "roleIds.0", reason: "invalid_type" }],
  });

  // The precise path survives, so the UI can still highlight the right input,
  // while the message a human reads carries the French label.
  expect(translated.fields).toEqual([{ field: "roleIds.0", message: "Rôles a un type invalide" }]);
});

test("resolves a nested field to its last segment rather than leaking the identifier", () => {
  // POST /api/events/series nests the event under a `template` object, so
  // Laravel reports `template.endTime`. There is deliberately no
  // `fields.template.endTime` in the catalogue — the French for it is the
  // same words as for a bare `endTime`, and spelling every nested field out
  // twice is how one of them eventually gets missed. Without the fallback
  // this prints the raw English `template.endTime` on a French screen.
  const translated = translateApiError({
    code: "validation_failed",
    fields: [{ field: "template.endTime", reason: "must_be_after" }],
  });

  expect(translated.fields).toEqual([
    { field: "template.endTime", message: "Heure de fin doit être après le début" },
  ]);
});
