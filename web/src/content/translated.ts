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
