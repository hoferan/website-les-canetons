import { expect, test } from "@playwright/test";

/**
 * Every locator passes { exact: true }. Playwright's getByLabel is a
 * case-insensitive SUBSTRING match (Testing Library's is exact), so
 * getByLabel("Nom") also matches "Prénom" and "Table (nom de famille…)" — and
 * the failure reads as a bug in the page rather than in the locator.
 */
async function login(page: import("@playwright/test").Page, username: string) {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :", { exact: true }).fill(username);
  await page.getByLabel("Mot de passe :", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();
}

test("a visitor reserves a table and is thanked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "S’inscrire au souper" }).click();

  await expect(
    page.getByRole("heading", { name: "Souper des 25 ans des Canetons", level: 1 }),
  ).toBeVisible();

  await page.getByLabel("Prénom", { exact: true }).fill("Ada");
  await page.getByLabel("Nom", { exact: true }).fill("Lovelace");
  await page.getByLabel("Adresse", { exact: true }).fill("Rue du Test 1, 1700 Fribourg");
  await page.getByLabel("Téléphone", { exact: true }).fill("+41 79 000 00 00");
  await page.getByLabel("E-mail", { exact: true }).fill("ada@example.com");
  await page
    .getByLabel("Table (nom de famille ou nom de table)", { exact: true })
    .fill("Famille Lovelace");

  await page.getByRole("button", { name: "＋ Ajouter une personne" }).click();
  await page.getByLabel("Personne 2", { exact: true }).selectOption("child");

  await page.getByRole("button", { name: "Envoyer l’inscription" }).click();

  // The real proof-of-work runs here, against the mock's real challenge.
  await expect(page.getByRole("heading", { name: "Merci pour votre inscription !" })).toBeVisible();
  await expect(page.getByText("13 novembre 2027")).toBeVisible();
});

// A context per role: MSW's mocked session lives in sessionStorage, which pages
// in one context share, so a second login in the same context lands on the
// already-logged-in view.
test("an admin reads the summary from the home page", async ({ page }) => {
  await login(page, "demo.admin");
  await page.goto("/");

  // The admin half of the CTA FIRST, then the absence of the public half.
  // toHaveCount(0) is satisfied by a page that has not booted yet —
  // SessionProvider renders null until GET /api/config and GET /api/user
  // resolve — so asserting it straight after goto() would pass on an empty
  // document and prove nothing. Waiting for the card the admin does get is what
  // makes the zero mean "replaced" rather than "not rendered yet".
  const summaryLink = page.getByRole("link", { name: "Voir les inscriptions" });
  await expect(summaryLink).toBeVisible();
  await expect(page.getByRole("link", { name: "S’inscrire au souper" })).toHaveCount(0);
  await summaryLink.click();

  await expect(page.getByRole("heading", { name: /^Inscriptions —/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /Exporter en Excel/ })).toBeVisible();
});

// A LAYOUT test, which is why it is here and not in Vitest: jsdom has no layout
// engine, so the whole class of defect below is invisible to the 196 unit tests.
// The six-column table was `w-full` inside an overflow-x container, i.e.
// width:100% OF THAT CONTAINER — so it never scrolled, it squeezed: at 390px
// every phone number stacked five lines deep and the Total column still hung
// past the edge. Both assertions are symptoms, not the fix: a page that scrolls
// sideways, and a cell tall enough to have wrapped.
test("the summary table scrolls inside its own panel on a phone", async ({ page }) => {
  // Logged in at the default width FIRST: below the nav's breakpoint the
  // username link lives inside the collapsed menu, so the helper's own
  // visibility check would fail for a reason that has nothing to do with tables.
  await login(page, "demo.admin");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/signups_admin");
  await expect(page.getByRole("table", { name: "Inscriptions" })).toBeVisible();

  // The ROW, not the phone cell: cells stretch to the row, so the cell's own
  // height only ever reports the tallest column. A contact row is a name over
  // an address over padding — about 70px. The squeezed version stacked the
  // phone number over five lines and stood at ~130.
  const row = page.getByRole("row", { name: /Ada Lovelace/ });
  const box = await row.boundingBox();
  expect(box?.height ?? 0).toBeLessThan(95);

  // The page body itself must never move sideways, whatever the table does.
  const pageScrollsSideways = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
  expect(pageScrollsSideways).toBe(false);
});

// The guard is UX only — Laravel's capability:view_summary is the enforcement —
// but a member seeing an admin page that then 403s is a bug report either way.
test("a member without view_summary is refused in place", async ({ page }) => {
  await login(page, "demo.user");
  await page.goto("/signups_admin");

  await expect(page.getByRole("alert")).toHaveText("Accès refusé.");
  // Refused in place, NOT bounced: bouncing someone already past the login form
  // reads as "your session expired".
  await expect(page).toHaveURL(/\/signups_admin$/);
});
