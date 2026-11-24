import { readFileSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

/**
 * Every standalone link is a big enough target (#400): 44px tall on a phone
 * (WCAG 2.5.5, Apple's 44pt) and at least 24px at any width (WCAG 2.5.8),
 * measured on every route of the screenshot list.
 *
 * A link inside a sentence is exempt, as 2.5.8 allows: padding it would
 * spread the lines of the paragraph apart. Every other link counts as
 * standalone: one the layout made a block of its own (a flex or grid item,
 * `inline-flex`, `block`), or an inline link with no other text on its line,
 * like "← Retour au planning".
 *
 * This runs in the browser because jsdom computes no layout.
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

/** Every standalone link shorter than `min`, as `"text" WxH`. */
function smallLinks(page: Page, min: number) {
  return page.evaluate((min) => {
    const words = (element: Element) =>
      ((element as HTMLElement).innerText ?? "").trim().replace(/\s+/g, " ");

    // Whether text shares a line with an inline link: a text node or an
    // inline sibling with words, at the link's level or at that of an inline
    // ancestor. Block siblings start lines of their own, so they do not count:
    // a back link written straight into a <section> has the whole page as
    // its block, and still stands alone.
    const inSentence = (link: Element) => {
      let node: Element | null = link;
      while (node?.parentElement) {
        for (const sibling of node.parentElement.childNodes) {
          if (sibling === node) continue;
          if (sibling.nodeType === Node.TEXT_NODE && sibling.textContent?.trim()) return true;
          if (
            sibling instanceof Element &&
            getComputedStyle(sibling).display.startsWith("inline") &&
            words(sibling)
          ) {
            return true;
          }
        }
        node = node.parentElement;
        if (getComputedStyle(node).display !== "inline") break;
      }
      return false;
    };

    const found: string[] = [];
    for (const link of document.querySelectorAll("a[href]")) {
      const style = getComputedStyle(link);
      if (style.visibility === "hidden") continue;
      const box = link.getBoundingClientRect();
      // Hidden, or the skip link at rest (1x1 until it takes focus).
      if (box.width <= 1 || box.height <= 1) continue;

      if (style.display === "inline" && inSentence(link)) continue;

      if (box.height < min - 0.5) {
        found.push(
          `"${words(link).slice(0, 40)}" ${Math.round(box.width)}x${Math.round(box.height)}`,
        );
      }
    }
    return [...new Set(found)];
  }, min);
}

for (const [width, min] of [
  [375, 44],
  [1280, 24],
] as const) {
  for (const entry of PAGES) {
    test(`${entry.path} as ${entry.as ?? "visitor"} at ${width}px: standalone links are ${min}px tall`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      if (entry.as) await logIn(page, entry.as);
      await page.goto(entry.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.heading);
      await page.waitForLoadState("networkidle");

      expect(await smallLinks(page, min)).toEqual([]);
    });
  }
}
