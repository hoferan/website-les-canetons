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
