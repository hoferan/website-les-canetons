import { expect, type Page, test } from "@playwright/test";

/**
 * Logging in, and coming back to a session that has gone.
 *
 * Against the MOCKED backend on its own port; see playwright.config.ts. The
 * mocked session lives in sessionStorage under "msw:user" (handlers.ts), which
 * is what lets a test take it away the way an expired Sanctum cookie would:
 * remove the key, then load a page, and the backend boots believing nobody is
 * logged in.
 */
async function fillLogin(page: Page, username: string, password: string) {
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

test("a wrong password is refused on the form, which keeps the username", async ({ page }) => {
  await page.goto("/login");
  await fillLogin(page, "demo.player", "not-the-password");

  await expect(page.getByRole("alert").filter({ hasText: /\S/ })).toHaveText(
    "Nom d'utilisateur ou mot de passe incorrect",
  );
  await expect(page).toHaveURL(/\/login$/);
  // Only the password goes, so the commonest mistake costs one field.
  await expect(page.getByLabel("Identifiant")).toHaveValue("demo.player");
  await expect(page.getByLabel("Mot de passe", { exact: true })).toHaveValue("");

  // And the account is not half logged in behind the refusal.
  await expect(page.getByRole("button", { name: "Compte de demo.player" })).toHaveCount(0);
});

test("logging in from the front page lands on the front page, logged in", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "Connexion" }).locator("visible=true").first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion");

  await fillLogin(page, "demo.player", "demo");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("button", { name: "Compte de demo.player" })).toBeVisible();
});

/**
 * THE MEMBER WHO COMES BACK TO A DEAD SESSION. A link to their planning, a tab
 * left open overnight: the guard sends them to the login form, and logging in
 * must put them back on the page they asked for. Landing on the front page
 * would leave them to find their way back to it.
 */
test("an expired session sends the member to log in, then back to the page they asked for", async ({
  page,
}) => {
  await page.goto("/login");
  await fillLogin(page, "demo.player", "demo");
  await expect(page.getByRole("button", { name: "Compte de demo.player" })).toBeVisible();

  // The session expires while they are away.
  await page.evaluate(() => sessionStorage.removeItem("msw:user"));

  // A FULL LOAD, deliberately: it is what a member coming back does, and it is
  // what makes the mocked backend re-read the session it no longer has.
  await page.goto("/account");
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion");

  await fillLogin(page, "demo.player", "demo");

  await expect(page).toHaveURL(/\/account$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mon compte");
});
