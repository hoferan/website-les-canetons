import { useState } from "react";

import { ApiError } from "./http";
import { translateApiError, type TranslatedError } from "../i18n";

/**
 * A form's API error, in the UI's language.
 *
 * 1. The narrowing. The generated hooks type `TError` as the declared error
 *    models (`ValidationExceptionResponse | AuthLogin401` and so on), but the
 *    mutator always throws an `ApiError`, so `instanceof` decides.
 * 2. The fallback. Anything else (an HTML 502 from the host, a network drop)
 *    still needs a translated message, never a raw English string.
 * 3. The field lookup, so a message lands against its input.
 *
 * `fallbackMessage` is per form: "L'enregistrement a échoué" and "La connexion
 * a échoué" are not interchangeable.
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
