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
