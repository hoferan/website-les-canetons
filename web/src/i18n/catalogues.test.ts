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
 * TypeScript already fails the build on a missing or extra key, because de.ts
 * is declared `typeof fr`. This runs anyway, because a deep structural TS
 * error on a 250-line nested object is close to unreadable, and this prints
 * the offending paths.
 */
test("the two catalogues carry exactly the same keys", () => {
  const french = keyPaths(fr);
  const german = keyPaths(de);

  expect(german.filter((k) => !french.includes(k))).toEqual([]);
  expect(french.filter((k) => !german.includes(k))).toEqual([]);
});

/*
 * THERE IS DELIBERATELY NO "every German value differs from its French one"
 * TEST HERE.
 *
 * It was written and removed. Several values are legitimately identical in both
 * languages — "Adresse", "Option", "Galerie", "Team Direction" — so the test
 * only passes against an allowlist of them, and that allowlist has to grow with
 * every slice PR. api/tests/Feature/ApiErrorVocabularyTest.php argues the same
 * point at length about its own deleted KNOWN_GAPS constant: an exemption list
 * is an invitation to add the next entry.
 *
 * The failure it was reaching for — French pasted into de.ts and left there —
 * is caught by the German rendering assertions each slice adds beside its
 * French ones, which is where a human is already reading the copy.
 */

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
 * NOTHING OUTSIDE i18n/ MAY IMPORT A CATALOGUE DIRECTLY.
 *
 * This is the third distinct way French reached a German page, and the only
 * one a reader could not see: `Inbox.tsx` and `ContactMessages.tsx` rendered
 * `fr.contactMessages.delete` and friends — thirty direct reads between them —
 * so those two screens showed French at `/de/*` however they were reached,
 * even though #151 had already written every German string they needed. The
 * German was live and unreachable.
 *
 * The other two ways are caught elsewhere: a module-scope `t()` is caught by
 * the German rendering assertions each slice adds, and French punctuation
 * composed in JSX is caught by reading the page. This one had no such
 * backstop, because the values ARE the correct French — it fails only in the
 * other language, and only at a URL nobody was asserting.
 *
 * So: import `t` from ../i18n. The catalogues are data for i18next, not
 * modules for screens.
 */
test("no screen imports a catalogue directly — t() is the only door", async () => {
  const { readdir, readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  // process.cwd() rather than import.meta.url: vitest does not hand this
  // file a real file:// URL, and the resolved path came out as "/web/src".
  const root = join(process.cwd(), "web", "src");

  async function sources(dir: string): Promise<string[]> {
    const entries = await readdir(dir, { withFileTypes: true });
    const found = await Promise.all(
      entries.map(async (entry) => {
        const path = join(dir, entry.name);
        // i18n/ is where the catalogues legitimately live, and generated/ is
        // orval's output, which never renders text.
        if (entry.isDirectory()) {
          return entry.name === "i18n" || entry.name === "generated" ? [] : sources(path);
        }
        return /\.tsx?$/.test(entry.name) ? [path] : [];
      }),
    );
    return found.flat();
  }

  const offenders: string[] = [];

  for (const path of await sources(root)) {
    const text = await readFile(path, "utf8");
    if (/from\s+["'][^"']*i18n\/(fr|de)["']/.test(text)) {
      offenders.push(path.slice(root.length + 1));
    }
  }

  expect(offenders).toEqual([]);
});
