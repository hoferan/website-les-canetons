import { appendFileSync } from "node:fs";

import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * axe over every route, at a phone's width and a desktop's (#15).
 *
 * WCAG 2.2 A and AA, as axe can test them: what is on the page once it has
 * loaded. Open menus, dialogs, hover and focus states are not reached, and
 * neither is anything axe cannot judge by itself (whether a label makes
 * sense, whether focus order follows the reading order). Those are manual
 * passes, recorded on #15.
 *
 * THE KNOWN LIST IS THE GUARD. Every violation found on the day this spec
 * landed is written out below, one line per page, width and rule, and the
 * run fails in BOTH directions: on a violation that is not listed, and on a
 * listed one that is no longer found. So a fix has to delete its line to go
 * green, and deleting a line without the fix goes red. That is what keeps the
 * list from quietly outliving what it describes.
 *
 * Against the MOCKED backend, like every spec here; see playwright.config.ts.
 */

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const WIDTHS = [
  { name: "phone", width: 390, height: 844 },
  { name: "desktop", width: 1280, height: 900 },
] as const;

/** Who can reach which pages. Event 7 is the souper, the one that takes bookings. */
const VISITS: { as: string | null; paths: string[] }[] = [
  {
    as: null,
    paths: [
      "/",
      "/join",
      "/agenda",
      "/band",
      "/committee",
      "/history",
      "/contact",
      "/login",
      "/events/7/book",
      "/no-such-page",
      "/de/",
    ],
  },
  { as: "demo.player", paths: ["/events", "/account", "/account/password"] },
  {
    as: "demo.direction",
    paths: [
      "/events",
      "/members",
      "/inbox",
      "/contact-messages",
      "/events/new",
      "/events/new/series",
      "/events/7/edit",
      "/events/7/attendance",
      "/events/7/registrations",
      "/events/7/registration-options",
    ],
  },
];

/**
 * `<who> <path> @<width>: <axe rule>`, sorted. Empty means axe finds nothing
 * on any page this spec visits.
 */
const KNOWN: string[] = [
  // The violet "contact" link inside the paragraph: 1.12:1 against the grey
  // body text around it and no underline, so colour alone marks it.
  "anonymous /join @desktop: link-in-text-block",
  "anonymous /join @phone: link-in-text-block",
  // The pink "Jamais utilisé" and "Provisoire" pills: white 12px text on
  // #ff3d9a is 3.28:1, under the 4.5:1 that text that size needs.
  "demo.direction /members @desktop: color-contrast",
  "demo.direction /members @phone: color-contrast",
];

async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

for (const size of WIDTHS) {
  for (const visit of VISITS) {
    const who = visit.as ?? "anonymous";

    test(`axe: ${who} at ${size.name}`, async ({ browser }) => {
      // A FRESH CONTEXT PER ACCOUNT: a second login in a context that
      // already holds a session lands on the logged-in branch of /login.
      const context = await browser.newContext({
        viewport: { width: size.width, height: size.height },
      });
      const page = await context.newPage();

      if (visit.as) {
        // Logged in at desktop width, where the account button is in the
        // bar; the viewport is set back before any page is judged.
        await page.setViewportSize({ width: 1280, height: 900 });
        await logIn(page, visit.as);
        await page.setViewportSize({ width: size.width, height: size.height });
      }

      const found: string[] = [];
      for (const path of visit.paths) {
        await page.goto(path);
        await page.getByRole("heading", { level: 1 }).first().waitFor();
        await page.waitForLoadState("networkidle");

        const { violations } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        for (const violation of violations) {
          found.push(`${who} ${path} @${size.name}: ${violation.id}`);
          // A11Y_REPORT=<file> writes the detail behind each line, for
          // triage. Nothing reads it back; the assertions below use `found`.
          if (process.env.A11Y_REPORT) {
            appendFileSync(
              process.env.A11Y_REPORT,
              JSON.stringify({
                who,
                path,
                width: size.name,
                id: violation.id,
                impact: violation.impact,
                help: violation.help,
                nodes: violation.nodes.map((node) => ({
                  target: node.target.join(" "),
                  summary: node.failureSummary,
                })),
              }) + "\n",
            );
          }
        }
      }

      const mine = KNOWN.filter(
        (line) => line.startsWith(`${who} `) && line.includes(` @${size.name}: `),
      );

      expect(found.filter((line) => !mine.includes(line)).sort(), "new violations").toEqual([]);
      expect(
        mine.filter((line) => !found.includes(line)),
        "fixed, so delete from KNOWN",
      ).toEqual([]);

      await context.close();
    });
  }
}
