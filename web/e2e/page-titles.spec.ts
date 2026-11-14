import { readFileSync } from "node:fs";

import { type Browser, expect, type Page, test } from "@playwright/test";

/**
 * Every route has a title of its own, in both languages, and a navigation
 * moves focus to the new page's heading (#389).
 *
 * The sweep walks web/screenshots/pages.json, the list of every route, as the
 * account each entry names. Titles are compared across routes, not entries:
 * /events appears once per account and is one page.
 */

type Entry = { route: string; path: string; as: string | null; name: string; heading: string };

const PAGES = (JSON.parse(readFileSync("web/screenshots/pages.json", "utf8")) as Entry[]).filter(
  (entry) => !entry.path.startsWith("/de/"),
);

/** A route that only redirects shows its target's page, title and all. */
const ALIASES: Record<string, string> = {
  "/events/:id/registration-options": "/events/:id/book/edit",
};

const BAND = "Guggenmusik Les Canetons de Fribourg";
const SUFFIX = " – Les Canetons de Fribourg";

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

async function titleAt(page: Page, path: string, heading?: string) {
  await page.goto(path);
  const h1 = page.getByRole("heading", { level: 1 });
  if (heading) {
    await expect(h1).toHaveText(heading);
  } else {
    await expect(h1).toBeVisible();
  }
  await page.waitForLoadState("networkidle");
  return page.title();
}

async function sweep(browser: Browser) {
  const rows: Array<{ route: string; fr: string; de: string }> = [];
  const accounts = [...new Set(PAGES.map((entry) => entry.as))];

  for (const account of accounts) {
    const context = await browser.newContext();
    const page = await context.newPage();
    if (account) await logIn(page, account);

    for (const entry of PAGES.filter((one) => one.as === account)) {
      const route = ALIASES[entry.route] ?? entry.route;
      if (rows.some((row) => row.route === route)) continue;
      const fr = await titleAt(page, entry.path, entry.heading);
      const de = await titleAt(page, entry.path === "/" ? "/de/" : `/de${entry.path}`);
      rows.push({ route, fr, de });
    }
    await context.close();
  }
  return rows;
}

function duplicates(titles: string[]) {
  return titles.filter((title, index) => titles.indexOf(title) !== index);
}

test("every route has a title of its own, in French and in German", async ({ browser }) => {
  test.setTimeout(240_000);

  const rows = await sweep(browser);
  await test.info().attach("titles", {
    body: JSON.stringify(rows, null, 2),
    contentType: "application/json",
  });

  for (const { route, fr, de } of rows) {
    if (route === "/") {
      expect(fr, route).toBe(BAND);
      expect(de, route).toBe(BAND);
      continue;
    }
    for (const title of [fr, de]) {
      expect(title, route).toMatch(/ – Les Canetons de Fribourg$/);
      expect(title.length, route).toBeGreaterThan(SUFFIX.length);
    }
  }
  expect(duplicates(rows.map((row) => row.fr))).toEqual([]);
  expect(duplicates(rows.map((row) => row.de))).toEqual([]);
});

test("a keyboard navigation from the nav focuses the new page's heading", async ({ page }) => {
  await page.goto("/agenda");
  await expect(page).toHaveTitle(`Où nous voir${SUFFIX}`);
  const heading = page.getByRole("heading", { level: 1 });
  // A fresh load is announced by the browser; focus stays where it puts it.
  await expect(heading).not.toBeFocused();

  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Contact", exact: true })
    .focus();
  await page.keyboard.press("Enter");

  await expect(page).toHaveURL(/\/contact$/);
  await expect(page).toHaveTitle(`Contact${SUFFIX}`);
  await expect(heading).toHaveText("Contact");
  await expect(heading).toBeFocused();
});

test("Back restores the previous page's title", async ({ page }) => {
  await page.goto("/agenda");
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Contact", exact: true })
    .click();
  await expect(page).toHaveTitle(`Contact${SUFFIX}`);

  await page.goBack();

  await expect(page).toHaveTitle(`Où nous voir${SUFFIX}`);
});

test("switching language changes the title, and moves no focus", async ({ page }) => {
  await page.goto("/agenda");
  await expect(page).toHaveTitle(`Où nous voir${SUFFIX}`);

  await page.getByRole("link", { name: "Auf Deutsch wechseln" }).click();

  await expect(page).toHaveURL(/\/de\/agenda$/);
  await expect(page).toHaveTitle(`Wo Sie uns sehen${SUFFIX}`);
  await expect(page.getByRole("heading", { level: 1 })).not.toBeFocused();
});
