import { readFileSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

/**
 * Every text size, corner radius and shadow a page renders is a step of the
 * scales in design-system/tokens/tokens.css (#398), measured in a browser on
 * every route of the screenshot list, at a desktop and a phone width.
 *
 * tools/design-scales.test.mjs checks the classes; this checks what they and
 * everything else (vendored CSS, inline styles, a browser default) compute
 * to. A value outside the scale names the element that has it.
 */

interface ScreenshotPage {
  path: string;
  as: string | null;
  heading: string;
}

const PAGES = JSON.parse(readFileSync("web/screenshots/pages.json", "utf8")) as ScreenshotPage[];

// The steps, in px. Keep them in step with tokens.css.
const TEXT = [12, 14, 16, 18, 20, 24, 30, 36, 48, 96, 128];
// 3.35544e+07px is `calc(infinity * 1px)`, the full radius, as Chromium clamps it.
const RADIUS = [0, 6, 12, 18, 33554400];
// Each shadow by its geometry (x y blur spread, per layer); the colour is the
// surface's business.
const SHADOWS = [
  "5 5 0 0", // raised
  "3 3 0 0", // raised-sm on the page
  "4 4 0 0", // raised-sm on the stage
  "1 1 0 0", // raised-pressed
  "6 6 0 0, 0 14 34 0", // overlay
];

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

/** Every rendered value off the scales, as "what on which element". */
function offScale(page: Page) {
  return page.evaluate(
    ({ text, radius, shadows }) => {
      const found: string[] = [];
      const near = (value: number, steps: number[]) =>
        steps.some((step) => Math.abs(value - step) < 0.5);
      const name = (element: Element) => {
        const words = (element as HTMLElement).innerText?.trim().replace(/\s+/g, " ") ?? "";
        const classes = [...element.classList].slice(0, 4).join(".");
        return `<${element.tagName.toLowerCase()}${classes ? "." + classes : ""}> "${words.slice(0, 30)}"`;
      };
      // Split a computed shadow into layers, at the commas outside rgb().
      const layers = (shadow: string) => {
        const out: string[] = [];
        let depth = 0;
        let start = 0;
        for (let index = 0; index < shadow.length; index++) {
          if (shadow[index] === "(") depth++;
          else if (shadow[index] === ")") depth--;
          else if (shadow[index] === "," && depth === 0) {
            out.push(shadow.slice(start, index));
            start = index + 1;
          }
        }
        out.push(shadow.slice(start));
        return out.map((layer) => layer.trim());
      };

      for (const element of document.querySelectorAll("body *")) {
        const style = getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") continue;
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;

        const ownText = [...element.childNodes].some(
          (node) => node.nodeType === Node.TEXT_NODE && node.textContent?.trim(),
        );
        if (ownText && !near(parseFloat(style.fontSize), text)) {
          found.push(`text ${style.fontSize} on ${name(element)}`);
        }

        // An inner corner may be a step minus the parent's border, so it
        // meets the parent's inner edge.
        const parent = element.parentElement ? getComputedStyle(element.parentElement) : null;
        const inset = parent ? parseFloat(parent.borderTopWidth) || 0 : 0;
        for (const corner of [
          style.borderTopLeftRadius,
          style.borderTopRightRadius,
          style.borderBottomRightRadius,
          style.borderBottomLeftRadius,
        ]) {
          const value = parseFloat(corner);
          if (corner.includes("%") || corner.trim().includes(" ")) {
            found.push(`radius ${corner} on ${name(element)}`);
          } else if (!near(value, radius) && !near(value + inset, radius)) {
            found.push(`radius ${corner} on ${name(element)}`);
          }
        }

        if (style.boxShadow !== "none") {
          // Tailwind writes empty ring layers in front of every shadow. A ring
          // (`ring-2`, a focus ring) is a spread with no offset or blur: an
          // outline drawn as a shadow, not a step of the elevation scale.
          const real = layers(style.boxShadow).filter(
            (layer) =>
              !/^rgba\(0, 0, 0, 0\) 0px 0px 0px 0px$/.test(layer) &&
              !/(^|\s)0px 0px 0px [\d.]+px$/.test(layer.replace(/\s*inset$/, "")),
          );
          const geometry = real
            .map((layer) =>
              (layer.replace(/rgba?\([^)]*\)|oklab\([^)]*\)|#\w+/g, "").match(/-?[\d.]+px/g) ?? [])
                .map((px) => String(parseFloat(px)))
                .join(" "),
            )
            .join(", ");
          if (real.length > 0 && !shadows.includes(geometry)) {
            found.push(`shadow ${geometry} on ${name(element)}`);
          }
        }
      }
      return [...new Set(found)];
    },
    { text: TEXT, radius: RADIUS, shadows: SHADOWS },
  );
}

for (const width of [1280, 390]) {
  for (const entry of PAGES) {
    test(`${entry.path} as ${entry.as ?? "visitor"} at ${width}px renders only scale steps`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      if (entry.as) await logIn(page, entry.as);
      await page.goto(entry.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.heading);
      await page.waitForLoadState("networkidle");

      expect(await offScale(page)).toEqual([]);
    });
  }
}
