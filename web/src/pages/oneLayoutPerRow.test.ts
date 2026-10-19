import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * No page may render the same rows twice, once per viewport.
 *
 * Two hand-maintained layouts of one list, picked by Tailwind, drift apart
 * with a green suite over them (#98, #130). The card is the only layout; this
 * stops a table coming back beside it.
 *
 * It matches the pair, not either half. `md:hidden` alone is fine: plenty of
 * things are hidden on one viewport with no counterpart. A duplicated row
 * layout shows as both markers in one file, something hidden above the
 * breakpoint and something hidden below it.
 */
// Resolved from the Vitest root (the repo root) rather than from
// `import.meta.url`: under the jsdom environment that is an http: URL, and
// fileURLToPath refuses it.
const PAGES = resolve(process.cwd(), "web/src/pages");

/** Hidden from `md` up: the phone half of a viewport-switched pair. */
const HIDDEN_ABOVE = /\bmd:hidden\b/;

/**
 * Hidden below `md`: the desktop half.
 *
 * Read per class list rather than as one regex over the file, because the two
 * classes need not be adjacent: `hidden overflow-x-auto md:block` escapes a
 * `hidden\s+md:block` pattern.
 */
const CLASS_LISTS = /className="([^"]*)"/g;

function hiddenBelowMd(source: string): boolean {
  return [...source.matchAll(CLASS_LISTS)].some((match) => {
    const names = (match[1] ?? "").split(/\s+/);
    return (
      names.includes("hidden") && names.some((name) => /^md:(block|flex|grid|table)$/.test(name))
    );
  });
}

function pageSources(): { name: string; source: string }[] {
  return readdirSync(PAGES)
    .filter((name) => name.endsWith(".tsx") && !name.endsWith(".test.tsx"))
    .map((name) => ({ name, source: readFileSync(join(PAGES, name), "utf8") }));
}

describe("pages", () => {
  it("render one layout, not one per viewport", () => {
    const offenders = pageSources()
      .filter(({ source }) => HIDDEN_ABOVE.test(source) && hiddenBelowMd(source))
      .map(({ name }) => name);

    expect(offenders).toEqual([]);
  });

  it("reads every page, so a rename cannot empty the guard", () => {
    expect(pageSources().length).toBeGreaterThan(20);
  });
});
