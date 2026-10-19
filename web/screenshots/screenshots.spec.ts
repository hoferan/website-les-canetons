import { readFileSync } from "node:fs";

import { expect, type Page, test } from "@playwright/test";

/**
 * A picture of every route, at a desktop width and a phone width, for a
 * reviewer who does not want to stand up the stack (#42). Run by
 * `npm run screenshots`, never by `npm run test:e2e`: it asserts only that
 * each page rendered as itself, and the pixels are for a person to look at.
 *
 * The list is web/screenshots/pages.json, and tools/screenshot-pages.test.mjs
 * fails when routes.tsx gains a route the list does not photograph.
 *
 * One test per page and width, each in a fresh context that logs in on its
 * own, so every page has the whole test timeout to itself and a failure names
 * the page.
 */

interface ScreenshotPage {
  route: string;
  path: string;
  as: string | null;
  name: string;
  heading: string;
}

const PAGES = JSON.parse(readFileSync("web/screenshots/pages.json", "utf8")) as ScreenshotPage[];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900 },
  { name: "phone", width: 390, height: 844 },
];

const OUT = "dist/screenshots";

async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  // Not the account button the specs wait on: at phone width it exists only
  // while the menu is open.
  await expect(page).not.toHaveURL(/\/login$/);

  // The mocked demo.both holds a committee-issued password, and the gate
  // shows its form in place of every members' page until it is replaced.
  if (new URL(page.url()).pathname === "/account/password") {
    await page.getByLabel("Mot de passe actuel").fill("demo");
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("demo1234");
    await page.getByLabel("Confirmer le nouveau mot de passe").fill("demo1234");
    await page.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(page.getByText("Votre mot de passe a été changé.")).toBeVisible();
  }
}

for (const viewport of VIEWPORTS) {
  for (const entry of PAGES) {
    const who = entry.as ?? "visitor";

    test(`${entry.path} as ${who} at ${viewport.name}`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      if (entry.as) {
        await logIn(page, entry.as);
      }
      await page.goto(entry.path);

      // Rendered as itself: on the URL it was asked for, under its own
      // heading. The URL alone proves little, because the password gate
      // shows its own form, h1 and all, at whatever URL was asked for.
      await expect(page).toHaveURL(entry.path);
      await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.heading);
      await page.waitForLoadState("networkidle");

      await page.screenshot({
        path: `${OUT}/${viewport.name}/${who}/${entry.name}.png`,
        fullPage: true,
        animations: "disabled",
      });
    });
  }
}
