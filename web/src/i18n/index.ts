import i18next from "i18next";

import type { ApiError, ApiErrorField } from "../api/http";
import { fr } from "./fr";

const FALLBACK = "Une erreur est survenue. Veuillez réessayer.";

i18next.init({
  lng: "fr",
  fallbackLng: "fr",
  resources: { fr: { translation: fr } },
});

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
    const fieldKey = `fields.${entry.field}`;
    const label = i18next.exists(fieldKey) ? i18next.t(fieldKey) : entry.field;
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
