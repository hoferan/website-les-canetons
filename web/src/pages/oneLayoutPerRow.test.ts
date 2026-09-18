import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * No page may render the same rows twice, once per viewport.
 *
 * Four screens used to hand-maintain a card list below `md` and a table from
 * `md` up, both in the DOM at once and picked by Tailwind. Nothing forced the
 * two to agree, and they did not: `/events/{id}/registrations` carried the
 * guest's postal address on the card and nowhere at all on the table, for the
 * whole life of the screen, with a green suite over it throughout (#98, #130).
 *
 * The tables are gone and the card is the only layout, so the two cannot
 * disagree any more. This is what stops the split coming back — it is cheaper
 * to add a table beside a card than to notice that somebody did.
 *
 * WHAT IT MATCHES, and why it is the pair rather than either half. `md:hidden`
 * alone is fine: plenty of things are hidden on one viewport and have no
 * counterpart. The signature of a duplicated row layout is both markers in one
 * file — something hidden above the breakpoint AND something hidden below it,
 * which is how you show two renderings of one list.
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
 * classes need not be adjacent and were not: the guest list wrote
 * `hidden overflow-x-auto md:block`, so a `hidden\s+md:block` pattern missed
 * the very page whose missing column raised #130.
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
