import { useState } from "react";

import { ApiError } from "./http";
import { translateApiError, type TranslatedError } from "../i18n";

/**
 * A form's API error, in French.
 *
 * Three things every form in this app needs and gets wrong differently:
 *
 * 1. **The narrowing.** The generated hooks type `TError` as the DECLARED error
 *    models — `ValidationExceptionResponse | AuthLogin401` and so on — but what
 *    the mutator actually throws is always an `ApiError`. The declared type is
 *    not to be trusted here; `instanceof` is.
 * 2. **The fallback.** Anything that is not an `ApiError` (an HTML 502 from the
 *    shared host, a network drop) still has to say something in French, and it
 *    must not be a raw English string or an i18next key.
 * 3. **The field lookup**, so a message lands against the input it is about.
 *
 * `fallbackMessage` is per-form on purpose: "L'enregistrement a échoué" and
 * "La connexion a échoué" are not interchangeable, and a generic one would be
 * the worst of both.
 */
export function useApiFormError(fallbackMessage: string) {
  const [error, setError] = useState<TranslatedError | null>(null);

  /** Pass this straight to a mutation's `onError`. */
  const setFromThrown = (thrown: unknown) => {
    setError(
      thrown instanceof ApiError
        ? translateApiError(thrown)
        : { message: fallbackMessage, fields: [] },
    );
  };

  const clear = () => setError(null);

  const messageFor = (field: string) =>
    error?.fields.find((entry) => entry.field === field)?.message;

  return { error, setFromThrown, clear, messageFor };
}
