import { readFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * The heading outline of every route in web/screenshots/pages.json, in French
 * and in German (#392).
 *
 * A screen reader user moves through a page by its headings, so the levels
 * have to describe the page: one h1, and no level that skips one on the way
 * down (an h3 straight after the h1 hides which section it belongs to). axe
 * runs its own `heading-order` rule here as well. That rule is tagged
 * best-practice, not WCAG, so a11y.spec.ts never runs it.
 *
 * MUTATION TEST: against the pages as they were before #392, the walk found
 * h1 then h3 on /agenda and /events/7/book in both languages, and the /events
 * case below found no event title under a section.
 */

interface PageEntry {
  path: string;
  as: string | null;
}

const PAGES = JSON.parse(readFileSync("web/screenshots/pages.json", "utf8")) as PageEntry[];

/** The German mount takes every path, with `/de` in front. */
function german(path: string): string {
  return path === "/" ? "/de/" : `/de${path}`;
}

/** Each path once per language, `/de/` being already in the list. */
function pathsFor(as: string | null): string[] {
  const french = PAGES.filter((entry) => entry.as === as && !entry.path.startsWith("/de/"));
  return french.flatMap((entry) => [entry.path, german(entry.path)]);
}

const ACCOUNTS = [...new Set(PAGES.map((entry) => entry.as))];

async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);

  // The mocked demo.both holds a committee-issued password; until it is
  // replaced, the gate shows its form in place of every members' page.
  if (new URL(page.url()).pathname === "/account/password") {
    await page.getByLabel("Mot de passe actuel").fill("demo");
    await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("demo1234");
    await page.getByLabel("Confirmer le nouveau mot de passe").fill("demo1234");
    await page.getByRole("button", { name: "Changer le mot de passe" }).click();
    await expect(page.getByText("Votre mot de passe a été changé.")).toBeVisible();
  }
}

/** `h<level> <text>` for every heading in the accessibility tree, in order. */
async function outline(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, [role=heading]")]
      .filter((el) => !el.closest("[aria-hidden=true], [hidden]") && el.checkVisibility())
      .map((el) => {
        const level = Number(el.getAttribute("aria-level") ?? el.tagName.slice(1));
        return `h${level} ${(el.textContent ?? "").replace(/\s+/g, " ").trim()}`;
      }),
  );
}

/** Every place the outline breaks: not starting at h1, or skipping a level. */
function breaks(headings: string[]): string[] {
  const found: string[] = [];
  let previous = 0;
  for (const heading of headings) {
    const level = Number(heading.slice(1, 2));
    if (previous === 0 ? level !== 1 : level > previous + 1) {
      found.push(`${previous === 0 ? "starts with" : `h${previous} then`} ${heading}`);
    }
    previous = level;
  }
  return found;
}

for (const as of ACCOUNTS) {
  const who = as ?? "anonymous";
  const paths = pathsFor(as);

  test(`no heading level is skipped: ${who}`, async ({ browser }) => {
    test.setTimeout(20_000 + paths.length * 5_000);

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    if (as) {
      await logIn(page, as);
    }

    const found: string[] = [];
    for (const path of paths) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await page.waitForLoadState("networkidle");

      for (const problem of breaks(await outline(page))) {
        found.push(`${path}: ${problem}`);
      }
      const { violations } = await new AxeBuilder({ page }).withRules(["heading-order"]).analyze();
      for (const violation of violations) {
        for (const node of violation.nodes) {
          found.push(`${path}: axe ${violation.id} at ${node.target.join(" ")}`);
        }
      }
    }

    expect(found).toEqual([]);
    await context.close();
  });
}

/**
 * The case the issue names: a screen reader's heading list for /events reads
 * each section, then the events in it one level down.
 */
test("/events lists its sections, then the events beneath them", async ({ page }) => {
  await logIn(page, "demo.player");
  await page.goto("/events");
  await page.getByRole("heading", { level: 1 }).waitFor();
  await page.waitForLoadState("networkidle");

  const section = page.getByRole("heading", { level: 2, name: "À répondre" });
  await expect(section).toBeVisible();
  const events = page.getByRole("heading", { level: 3 });
  expect(await events.count()).toBeGreaterThan(0);
  // No event title sits at the level of the sections.
  for (const heading of await page.getByRole("heading", { level: 2 }).allTextContents()) {
    expect(["À répondre", "Brouillons", "Le reste du planning"]).toContain(heading.trim());
  }
});
