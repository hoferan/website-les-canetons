import type { TranslationKey } from ".";
import { de } from "./de";
import { fr } from "./fr";
import type { Locale } from "./locale";

/**
 * Copies, taken before any text is applied. i18next writes an added resource
 * into the very object it was initialised with, so the catalogue modules
 * themselves end up holding the band's wording, and a default read from them
 * after a save would be that save.
 */
const CATALOGUES: Record<Locale, unknown> = {
  fr: structuredClone(fr),
  "de-CH": structuredClone(de),
};

/**
 * A text as the code ships it, read from the catalogue itself rather than from
 * i18next, which may already hold an override for it. Undefined for a key the
 * catalogue does not have, or one that names a section rather than a text.
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
 * stores. German is left out when it reads the same as French (a name, a
 * place), so the editor opens on one field rather than two copies.
 */
export function fromCatalogue(key: TranslationKey): { fr: string; de?: string } {
  const french = catalogueValue("fr", key) ?? "";
  const german = catalogueValue("de-CH", key) ?? french;
  return german === french ? { fr: french } : { fr: french, de: german };
}

/**
 * A value that is never translated (a name typed once, an address, a URL), as
 * the French catalogue ships it.
 */
export function catalogueString(key: TranslationKey): string {
  return catalogueValue("fr", key) ?? "";
}
