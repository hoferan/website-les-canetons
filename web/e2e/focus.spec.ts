import { appendFileSync, readFileSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

/**
 * Every keyboard focus stop shows a ring of at least 3:1 against what is
 * painted behind it (#391, WCAG 1.4.11), on every route of the screenshot
 * list, at a phone and a desktop width.
 *
 * The ring is an outline, on the focused element or on the part of it that
 * draws the control: a child (`group-focus-visible`), the label after a
 * hidden input (`peer-focus-visible`) or a wrapper (`has-[:focus-visible]`).
 * What it must stand out from is read at the ring, from what the browser
 * hit-tests there: the header for the skip link, the card for a field, every
 * stop of the gradient for a hero button. A focus stop with no ring fails,
 * unless it changes its own fill by 3:1 instead (the action bar's segments).
 *
 * One Tab first, so that the focus() calls that follow count as keyboard
 * focus and match :focus-visible, as they would after a Tab.
 *
 * FOCUS_REPORT=<file> appends every measurement to that file as JSON lines,
 * which is how the before and after of #391 were counted.
 */

interface ScreenshotPage {
  path: string;
  as: string | null;
  heading: string;
}

const PAGES = JSON.parse(readFileSync("web/screenshots/pages.json", "utf8")) as ScreenshotPage[];

async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  // The mocked demo.both must replace a committee-issued password first.
  if (new URL(page.url()).pathname === "/account/password") {
    await page.getByLabel("Mot de passe actuel").fill("demo");
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("demo1234");
    await page.getByLabel("Confirmer le nouveau mot de passe").fill("demo1234");
    await page.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(page.getByText("Votre mot de passe a été changé.")).toBeVisible();
  }
}

interface Stop {
  /** The element, as `tag[role] "name"`. */
  el: string;
  focusVisible: boolean;
  /** `solid 2px rgb(…) +2px`, or how the stop shows focus otherwise. */
  ring: string;
  /** The colours painted behind the ring, at its four sides. */
  grounds: string[];
  /** The lowest contrast against any of them; 0 for no indicator. */
  contrast: number;
}

/** Every focus stop on the page, focused one by one and measured. */
function focusStops(page: Page) {
  return page.evaluate(async (): Promise<Stop[]> => {
    const luminance = (colour: string) =>
      (colour.match(/[\d.]+/g) ?? [])
        .slice(0, 3)
        .map((value) => Number(value) / 255)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, index) => sum + c * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
    const ratio = (a: string, b: string) => {
      const [x, y] = [luminance(a), luminance(b)];
      return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
    };
    const opaque = (colour: string) =>
      colour !== "transparent" && !/^rgba\(.*,\s*0\)$/.test(colour);
    const name = (element: Element) => {
      const words = (
        (element as HTMLElement).innerText ||
        element.getAttribute("aria-label") ||
        element.getAttribute("name") ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 30);
      const role = element.getAttribute("role");
      return `${element.tagName.toLowerCase()}${role ? `[${role}]` : ""} "${words}"`;
    };
    const outline = (element: Element) => {
      const style = getComputedStyle(element);
      return style.outlineStyle === "none" || parseFloat(style.outlineWidth) === 0 ? null : style;
    };

    // The parts that may draw the ring for a focused element, nearest first.
    const parts = (element: Element) => [
      element,
      ...element.querySelectorAll("*"),
      ...[element.nextElementSibling].filter((next): next is Element => next !== null),
      ...[element.parentElement, element.parentElement?.parentElement].filter(
        (up): up is HTMLElement => up instanceof HTMLElement,
      ),
    ];

    const selector =
      'a[href], button, input:not([type="hidden"]), select, textarea, [tabindex], [contenteditable="true"]';

    // The colours painted at a point, under the ring: the first element the
    // browser hit-tests there that paints a colour or a gradient. A ring drawn
    // inside its control (a negative offset) sits on the control itself, so
    // only its children are skipped. A point off the screen, on another
    // control lying across the ring (a block editor's "+" between two cards)
    // or on a floating layer says nothing about the ground and counts for no
    // side.
    const paintedAt = (x: number, y: number, ring: Element, inset: boolean) => {
      if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return [];
      for (const under of document.elementsFromPoint(x, y)) {
        if (ring.contains(under) && (under !== ring || !inset)) continue;
        const control = under.closest(selector);
        if (control && !control.contains(ring)) return [];
        // The tooltip of the icon button focused just before, fading out.
        if (under.closest("[data-radix-popper-content-wrapper]")) return [];
        const style = getComputedStyle(under);
        const stops = style.backgroundImage.includes("gradient")
          ? (style.backgroundImage.match(/rgba?\([^)]*\)/g) ?? []).filter(opaque)
          : [];
        if (!stops.length && opaque(style.backgroundColor)) stops.push(style.backgroundColor);
        // Named, so a failure says what the ring crosses; luminance() reads
        // only the colour's three leading numbers.
        const by = `${under.tagName.toLowerCase()}.${String(under.className).split(" ")[0]}`;
        if (stops.length) return stops.map((stop) => `${stop} ${by}`);
      }
      return ["rgb(255, 255, 255) none"];
    };

    // The first Tab put the focus somewhere; start from none.
    (document.activeElement as HTMLElement | null)?.blur();
    const stops: Stop[] = [];
    for (const element of document.querySelectorAll<HTMLElement>(selector)) {
      if (element.tabIndex < 0 || element.matches(":disabled")) continue;
      const candidates = parts(element);
      const before = candidates.map((part) => outline(part)?.outlineColor ?? null);
      const fillBefore = getComputedStyle(element).backgroundColor;

      element.focus();
      if (document.activeElement !== element) continue;
      // Clear of the sticky bars and the screen's edges, as a user would
      // scroll it to look at it.
      element.scrollIntoView({ block: "center", inline: "nearest" });
      await Promise.all(
        candidates.flatMap((part) => part.getAnimations()).map((a) => a.finished.catch(() => {})),
      );

      const index = candidates.findIndex((part, i) => outline(part) && before[i] === null);
      const ring = index === -1 ? null : candidates[index];
      const style = ring ? outline(ring) : null;
      const box = (ring ?? element).getBoundingClientRect();
      // Out of sight, so not a stop a sighted keyboard user meets.
      if (!ring && (box.width <= 1 || box.height <= 1)) {
        element.blur();
        continue;
      }

      const entry: Stop = {
        el: name(element),
        focusVisible: element.matches(":focus-visible"),
        ring: "none",
        grounds: [],
        contrast: 0,
      };
      if (ring && style) {
        const offset = parseFloat(style.outlineOffset);
        const out = offset + parseFloat(style.outlineWidth) / 2;
        const [cx, cy] = [box.left + box.width / 2, box.top + box.height / 2];
        const sides: [number, number][] = [
          [box.left - out, cy],
          [box.right + out, cy],
          [cx, box.top - out],
          [cx, box.bottom + out],
        ];
        const grounds = [...new Set(sides.flatMap(([x, y]) => paintedAt(x, y, ring, offset < 0)))];
        entry.ring = `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor} +${style.outlineOffset}`;
        entry.grounds = grounds;
        entry.contrast = Math.min(...grounds.map((ground) => ratio(style.outlineColor, ground)));
      } else {
        const fill = getComputedStyle(element).backgroundColor;
        if (opaque(fill) && opaque(fillBefore) && fill !== fillBefore) {
          entry.ring = `fill ${fillBefore} -> ${fill}`;
          entry.contrast = ratio(fill, fillBefore);
        }
      }
      entry.contrast = Math.round(entry.contrast * 100) / 100;
      stops.push(entry);
      element.blur();
    }
    return stops;
  });
}

// Both widths in one test, so each route costs one login rather than two.
for (const entry of PAGES) {
  test(`${entry.path} as ${entry.as ?? "visitor"}: every focus ring is 3:1`, async ({ page }) => {
    if (entry.as) await logIn(page, entry.as);
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(entry.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.heading);
      await page.waitForLoadState("networkidle");
      await page.keyboard.press("Tab");

      const stops = await focusStops(page);
      if (process.env.FOCUS_REPORT) {
        appendFileSync(
          process.env.FOCUS_REPORT,
          `${JSON.stringify({ path: entry.path, as: entry.as, width, stops })}
`,
        );
      }

      expect.soft(stops.length, `${width}px`).toBeGreaterThan(0);
      expect
        .soft(
          stops.filter((stop) => !stop.focusVisible).map((stop) => stop.el),
          `${width}px: not :focus-visible`,
        )
        .toEqual([]);
      expect
        .soft(
          stops
            .filter((stop) => stop.contrast < 3)
            .map(
              (stop) =>
                `${stop.el}: ${stop.ring} on ${stop.grounds.join(" / ")} = ${stop.contrast}`,
            ),
          `${width}px: under 3:1`,
        )
        .toEqual([]);
    }
  });
}

/** A click draws no ring; the same control reached by Tab does. */
test("a mouse click leaves no focus ring, a Tab does", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await logIn(page, "demo.player");
  await page.goto("/events");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Planning");

  const filter = page.getByRole("radio", { name: "Concert" });
  const pill = filter.locator("span");
  await filter.click();
  await expect(filter).toBeFocused();
  await expect(pill).toHaveCSS("outline-style", "none");

  await page.keyboard.press("ArrowRight");
  const next = page.getByRole("radio", { name: "Sortie" });
  await expect(next).toBeFocused();
  await expect(next.locator("span")).toHaveCSS("outline-style", "solid");
});
