import { z } from "zod";

import { currentLocale } from "../i18n";

export { fromCatalogue } from "../i18n/catalogueText";

/**
 * Every text field of a block, in both languages.
 *
 * German is optional: a phone row's label or a name typed once is the same on
 * both pages, and the editor offers a German field only when it differs.
 */
export type Translated = { fr: string; de?: string };

export const translated: z.ZodType<Translated> = z.object({
  fr: z.string(),
  de: z.string().optional(),
});

/**
 * The text for the page being rendered. A blank German value falls back to
 * the French one, so an emptied German field never empties the German page.
 */
export function tr(value: Translated): string {
  if (currentLocale() === "de-CH" && value.de !== undefined && value.de.trim() !== "") {
    return value.de;
  }
  return value.fr;
}

/**
 * A hero's highlighted words for the page being rendered. A German page whose
 * title has a German wording takes them from the German mark alone, never
 * from the French one: the editor's German row shows that mark only, and
 * "Aucun" there must leave the German page plain. Without a German title, the
 * German page shows the French title and so the French mark.
 */
export function trMark(title: Translated, mark: Translated | undefined): string {
  if (currentLocale() === "de-CH" && title.de !== undefined && title.de.trim() !== "") {
    return mark?.de ?? "";
  }
  return mark?.fr ?? "";
}

/**
 * Whether a block, a card or a single text shows French on the German page
 * because a text has no German, or only a blank one (#359). A text with no
 * French either shows nothing, so it does not count.
 *
 * A hero's `mark` is skipped: it is the highlight inside the title, not a
 * text, and a German title with no German mark is "Aucun" on purpose.
 */
export function lacksGerman(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(lacksGerman);
  if (value === null || typeof value !== "object") return false;
  if (isTranslated(value)) return value.fr.trim() !== "" && (value.de ?? "").trim() === "";
  return Object.entries(value).some(([key, inner]) => key !== "mark" && lacksGerman(inner));
}

function isTranslated(value: object): value is Translated {
  const keys = Object.keys(value);
  return (
    typeof (value as { fr?: unknown }).fr === "string" &&
    keys.every((key) => key === "fr" || key === "de")
  );
}
