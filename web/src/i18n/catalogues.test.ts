import { expect, test } from "vitest";

import { de } from "./de";
import { fr } from "./fr";

/** Every leaf key path in an object, dotted, sorted. */
function keyPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) {
    return [prefix];
  }

  return Object.entries(value as Record<string, unknown>)
    .flatMap(([key, child]) => keyPaths(child, prefix ? `${prefix}.${key}` : key))
    .sort();
}

/**
 * TypeScript already fails the build on a missing or extra key (de.ts is
 * `typeof fr`), but its deep structural error is close to unreadable; this
 * prints the offending paths.
 */
test("the two catalogues carry exactly the same keys", () => {
  const french = keyPaths(fr);
  const german = keyPaths(de);

  expect(german.filter((k) => !french.includes(k))).toEqual([]);
  expect(french.filter((k) => !german.includes(k))).toEqual([]);
});

/*
 * There is no "every German value differs from its French one" test. Several
 * values are legitimately identical ("Adresse", "Option", "Galerie", "Team
 * Direction"), so it would need an allowlist, and an exemption list invites
 * the next entry. French left in de.ts is caught by the German rendering
 * assertions beside the French ones.
 */

/**
 * Each language picks the words its home page hero highlights, and a
 * highlight that is not in the sentence renders nothing without complaint.
 */
test.each([
  ["fr", fr.home],
  ["de", de.home],
])("the %s hero highlights words that are in the hero", (_, home) => {
  expect(home.heroHighlight).not.toBe("");
  expect(home.hero).toContain(home.heroHighlight);
});

/** The same pairing on the pages that open with a PageHero. */
test.each([
  ["fr", "agenda", fr.agenda],
  ["fr", "band", fr.band],
  ["fr", "committee", fr.committee],
  ["fr", "history", fr.history],
  ["fr", "join", fr.join],
  ["de", "agenda", de.agenda],
  ["de", "band", de.band],
  ["de", "committee", de.committee],
  ["de", "history", de.history],
  ["de", "join", de.join],
])("the %s %s heading highlights words that are in the heading", (_, __, page) => {
  expect(page.headingHighlight).not.toBe("");
  expect(page.heading).toContain(page.headingHighlight);
});

test("German uses ss, never the German-German eszett", () => {
  const offenders = keyPaths(de).filter((path) => {
    const value = path
      .split(".")
      .reduce<unknown>((acc, k) => (acc as Record<string, unknown>)?.[k], de);
    return typeof value === "string" && value.includes("ß");
  });

  expect(offenders).toEqual([]);
});

/**
 * Nothing outside i18n/ may import a catalogue directly. A screen reading
 * `fr.contactMessages.delete` shows correct French at `/de/*` too, which no
 * French assertion can catch. Import `t` from ../i18n; the catalogues are data
 * for i18next.
 */
test("no screen imports a catalogue directly — t() is the only door", async () => {
  // Synchronous reads: about 200 awaited readFile calls each wait an
  // event-loop turn while the suite loads every worker, which nearly exhausts
  // the 5 s timeout.
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  // process.cwd() rather than import.meta.url, which vitest does not hand
  // this file as a real file:// URL.
  const root = join(process.cwd(), "web", "src");

  function sources(dir: string): string[] {
    return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      const path = join(dir, entry.name);
      // i18n/ is where the catalogues legitimately live, and generated/ is
      // orval's output, which never renders text.
      if (entry.isDirectory()) {
        return entry.name === "i18n" || entry.name === "generated" ? [] : sources(path);
      }
      return /\.tsx?$/.test(entry.name) ? [path] : [];
    });
  }

  const offenders = sources(root)
    .filter((path) => /from\s+["'][^"']*i18n\/(fr|de)["']/.test(readFileSync(path, "utf8")))
    .map((path) => path.slice(root.length + 1));

  expect(offenders).toEqual([]);
});
