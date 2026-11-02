import i18next from "i18next";

import type { TextOverrideResource } from "../api/generated/model";
import { de } from "./de";
import { fr } from "./fr";
import type { Locale } from "./locale";

const CATALOGUES: Record<Locale, unknown> = { fr, "de-CH": de };

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

/** The keys the last call wrote, so the next can put back what it drops. */
let applied = new Set<string>();

/**
 * Writes the band's texts over the catalogue, so `t()` returns them with no
 * change at any call site (#106).
 *
 * A missing German value falls back to the French one before the catalogue:
 * a phone number or a name is the same in both languages, and the German page
 * must not keep showing the old one. A key the catalogue does not have is
 * skipped, since nothing renders it (a text stored by a newer build, or a key
 * since renamed).
 *
 * Every call replaces the whole set: a key the last call wrote and this one
 * does not gets its catalogue wording back.
 */
export function applyOverrides(rows: TextOverrideResource[]): void {
  const next = new Set<string>();

  for (const row of rows) {
    const frDefault = catalogueValue("fr", row.key);
    const deDefault = catalogueValue("de-CH", row.key);
    if (frDefault === undefined || deDefault === undefined) continue;

    write(row.key, row.fr ?? frDefault, row.de ?? row.fr ?? deDefault);
    next.add(row.key);
  }

  for (const key of applied) {
    if (!next.has(key)) {
      write(key, catalogueValue("fr", key) ?? "", catalogueValue("de-CH", key) ?? "");
    }
  }

  applied = next;
}

function write(key: string, french: string, german: string): void {
  // `keySeparator` is i18next's default ".", so a dotted key lands on the
  // nested entry t() reads.
  i18next.addResource("fr", "translation", key, french);
  i18next.addResource("de-CH", "translation", key, german);
}
