import { expect, test, type BrowserContext, type Page } from "@playwright/test";

/**
 * A late Bungee must not move the page (#395).
 *
 * Bungee is `font-display: swap`, so a heading is drawn in a fallback face
 * first and redrawn when the font arrives. Before the fix that fallback was
 * Karla, far narrower, and the home hero's title took one line more once
 * Bungee loaded: one layout shift of about 0.19, the whole of the home page's
 * CLS. "Bungee Fallback" in styles.css is Arial scaled to Bungee's width.
 *
 * Each page is loaded with the font blocked, which shows the fallback for
 * good, and with it held 1.5 s, which forces the swap after the first paint.
 * Neither may produce a layout-shift entry above 0.05.
 *
 * The routes are on the context, not the page: under the mocked backend
 * MSW's service worker makes the requests, and only a context route sees
 * them, with PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS set in
 * playwright.config.ts. The pattern takes the .woff as well as the .woff2:
 * when the woff2 fails the browser fetches the woff, and a woff2-only block
 * still swapped.
 *
 * MUTATION TEST: with "Bungee Fallback" taken out of --font-display, five
 * delayed cases fail with one entry each: / at both widths (0.19 to 0.20),
 * /de/ at 1280px (0.18) and /history at both (0.08 and 0.14). The blocked
 * cases pass either way, since nothing swaps there; they catch a shift that
 * is not the font's. Taking out the preload in index.html fails nothing
 * here, since the route holds the font either way; `npm run lighthouse` is
 * what measures the preload.
 */

const BUNGEE = "**/bungee-latin-400-normal.woff*";

const PAGES = ["/", "/de/", "/agenda", "/band", "/history"];

const WIDTHS = [1280, 390];

/** Bigger than any shift the pages have without the swap, and half of CLS's 0.1. */
const MAX_SHIFT = 0.05;

interface Shift {
  value: number;
  time: number;
  sources: string[];
}

/** Records every layout-shift entry not caused by input, from navigation on. */
async function recordShifts(context: BrowserContext) {
  await context.addInitScript(() => {
    type Entry = PerformanceEntry & {
      value: number;
      hadRecentInput: boolean;
      sources: { node?: Node; previousRect: DOMRectReadOnly; currentRect: DOMRectReadOnly }[];
    };
    const shifts: unknown[] = [];
    (window as unknown as { __shifts: unknown[] }).__shifts = shifts;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as Entry[]) {
        if (entry.hadRecentInput) continue;
        shifts.push({
          value: entry.value,
          time: Math.round(entry.startTime),
          // What moved, so a failure says where to look.
          sources: entry.sources.map((source) => {
            const text = (source.node?.textContent ?? "").trim().slice(0, 30);
            const from = Math.round(source.previousRect.y);
            const to = Math.round(source.currentRect.y);
            return `${source.node?.nodeName ?? "?"} "${text}" y ${from} -> ${to}`;
          }),
        });
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function shiftsOf(page: Page): Promise<Shift[]> {
  return page.evaluate(() => (window as unknown as { __shifts: Shift[] }).__shifts);
}

for (const mode of ["blocked", "delayed"] as const) {
  for (const width of WIDTHS) {
    for (const path of PAGES) {
      test(`${path} at ${width}px does not shift with Bungee ${mode}`, async ({
        context,
        page,
      }) => {
        await page.setViewportSize({ width, height: 800 });
        await recordShifts(context);
        let held = 0;
        await context.route(BUNGEE, async (route) => {
          held += 1;
          if (mode === "blocked") {
            await route.abort();
            return;
          }
          await new Promise((resolve) => setTimeout(resolve, 1500));
          await route.continue();
        });

        await page.goto(path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        // A route that never fired would make every case pass.
        await expect.poll(() => held).toBeGreaterThan(0);
        if (mode === "delayed") {
          await expect
            .poll(() => page.evaluate(() => document.fonts.check("16px Bungee")))
            .toBe(true);
        }
        // Past the API answers and the blocks gate, so a shift they cause
        // counts too.
        await page.waitForTimeout(2000);

        const shifts = await shiftsOf(page);
        expect(shifts.filter((shift) => shift.value > MAX_SHIFT)).toEqual([]);
      });
    }
  }
}

/**
 * The desktop bar sets its labels in capitals, which the heading fallback
 * draws far wider than Bungee does. Moving entries into "Plus" is not a
 * layout shift, so the cases above cannot see it.
 *
 * MUTATION TEST: with the `.font-display.uppercase` rule taken out of
 * styles.css, "Plus" appears at 1280px with Bungee blocked.
 */
test("at 1280px nothing folds into Plus while Bungee is late", async ({ context, page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await context.route(BUNGEE, (route) => route.abort());
  await page.goto("/");

  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav.getByRole("link", { name: "Facebook (nouvel onglet)" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Plus", exact: true })).toHaveCount(0);
});
