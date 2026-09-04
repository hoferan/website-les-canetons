import { expect, test } from "@playwright/test";

async function login(page: import("@playwright/test").Page, username: string) {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill(username);
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();
}

// The whole point of carrying the attempted path into router state: a member
// who clicks a deep link, logs in, and lands somewhere else has lost the thing
// they were trying to do.
//
// /inscriptions_admin, not /sinscrire: that URL now redirects to a PUBLIC page,
// so this test would pass against a page that never bounces and assert nothing
// at all. Any guarded route proves the mechanism; this one is guarded by
// RequireCapability, which is the only guard left.
test("a guard bounce returns you to the page you wanted", async ({ page }) => {
  await page.goto("/inscriptions_admin?id=1");
  await expect(page.getByRole("heading", { name: "Authentification" })).toBeVisible();

  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("heading", { name: "Résumé des inscriptions" })).toBeVisible();

  // The heading alone does not prove this worked: InscriptionsAdmin renders the
  // same h1 in its "no eventId" branch. If returnTo dropped the query string we
  // would land on /inscriptions_admin with no id, show "Aucun événement choisi"
  // and still pass. Asserting the URL is what proves the id survived the bounce.
  await expect(page).toHaveURL(/\/inscriptions_admin\?id=1$/);
});

test("a member answers an event in one tap and can change it", async ({ page }) => {
  await login(page, "demo.user");
  await page.goto("/planning_repet");

  const first = page.getByRole("list", { name: "Événements" }).getByRole("listitem").first();

  await first.getByRole("button", { name: "Je participe" }).click();
  await expect(first.getByText("Je participe")).toBeVisible();

  // The half the old flow could not do at all: the API always upserted, and
  // only the UI made a mistap permanent.
  await first.getByRole("button", { name: "Modifier" }).click();
  await first.getByRole("button", { name: "Je ne participe pas" }).click();
  await expect(first.getByText("Je ne participe pas")).toBeVisible();
});

test("an admin reads the summary instead of answering", async ({ page }) => {
  await login(page, "demo.admin");
  await page.goto("/planning_repet");

  await expect(page.getByRole("button", { name: "Je participe" })).toHaveCount(0);
  await page.getByRole("link", { name: "Résumé" }).first().click();

  await expect(page.getByRole("heading", { name: "Résumé des inscriptions" })).toBeVisible();
});

// THE REFUSAL PAGE, WHICH NOTHING HAD EVER LOOKED AT. The capability matrix is
// not a hierarchy, so an admin following a link to /inscriptions_utilisateurs is
// refused — correctly, and in place rather than bounced to a login form they are
// already past. What nobody checked was what that refusal RENDERS as: a bare
// `<p role="alert">Accès refusé.</p>`, outside the page shell, so the words sat
// flush against the left edge at x=0 while every other route on the site is
// padded. guards.test.tsx had four passing assertions over it, all of them true
// of that page, because they only ever asserted the string.
test("a refused admin gets a real page, not a sentence in the corner", async ({ page }) => {
  await login(page, "demo.admin");
  await page.goto("/inscriptions_utilisateurs");

  const heading = page.getByRole("heading", { name: "Accès refusé" });
  await expect(heading).toBeVisible();

  // PageSection's gutter is px-4. Asserting a real inset is what fails against
  // the unshelled paragraph; asserting the heading exists would not have.
  const box = (await heading.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(16);
});
