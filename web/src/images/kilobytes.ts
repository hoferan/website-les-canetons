import { currentLocale } from "../i18n";
import { intlTag } from "../i18n/locale";

/** A byte count in whole kilobytes, in the page's language: "412 ko", "412 kB". */
export function kilobytes(bytes: number): string {
  return new Intl.NumberFormat(intlTag(currentLocale()), {
    style: "unit",
    unit: "kilobyte",
    maximumFractionDigits: 0,
  }).format(bytes / 1024);
}
