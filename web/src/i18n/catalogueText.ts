import type { TranslationKey } from ".";
import { de } from "./de";
import { fr } from "./fr";
import type { Locale } from "./locale";

const CATALOGUES: Record<Locale, unknown> = { fr, "de-CH": de };

/**
 * A text as the code ships it, read from the catalogue itself. Undefined for a
 * key the catalogue does not have, or one that names a section rather than a
 * text.
 */
export function catalogueValue(locale: Locale, key: string): string | undefined {
  let node: unknown = CATALOGUES[locale];
  for (const part of key.split(".")) {
    if (typeof node !== "object" || node === null) return undefined;
    node = (node as Record<string, unknown>)[part];
  }
  return typeof node === "string" ? node : undefined;
}

/**
 * A text in both languages as the code ships it, the shape a content block
 * stores. German is kept even when it reads the same as French ("Werkhof" is
 * Werkhof in both): it is still the German wording, and a text without one
 * wears the pencil's "sans allemand" dot (#359).
 */
export function fromCatalogue(key: TranslationKey): { fr: string; de?: string } {
  const french = catalogueValue("fr", key) ?? "";
  const german = catalogueValue("de-CH", key);
  return german === undefined ? { fr: french } : { fr: french, de: german };
}

/**
 * A value that is never translated (a name typed once, an address, a URL), as
 * the French catalogue ships it.
 */
export function catalogueString(key: TranslationKey): string {
  return catalogueValue("fr", key) ?? "";
}
