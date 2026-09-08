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
