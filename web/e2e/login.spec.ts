import { expect, type Page, test } from "@playwright/test";

/**
 * Logging in, and coming back to a session that has gone.
 *
 * Against the MOCKED backend on its own port; see playwright.config.ts. The
 * mocked session lives in sessionStorage under "msw:user" (handlers.ts), which
 * is what lets a test take it away the way an expired Sanctum cookie would:
 * remove the key, and the backend's next request finds nobody logged in,
 * whether that request comes from a fresh load or from a page left open.
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

/**
 * THE SESSION THAT DIES WHILE THE PAGE IS OPEN (#296). Nothing reloads, so
 * nothing re-reads the session at boot: the first the SPA hears of it is a
 * write answering 401. That has to take the member to the login form and,
 * once they are back in, to the page they were on.
 */
test("a session that expires under an open page sends the member to log in, then back", async ({
  page,
}) => {
  await page.goto("/login");
  await fillLogin(page, "demo.player", "demo");
  await expect(page.getByRole("button", { name: "Compte de demo.player" })).toBeVisible();

  // Through the nav, not page.goto: a full load would re-read the session and
  // test the case above instead.
  await page.getByRole("link", { name: "Événements" }).locator("visible=true").first().click();
  await expect(page).toHaveURL(/\/events$/);
  const card = page.getByTestId("event-card").filter({ hasText: "Weekend musical" });
  const coming = card.getByRole("button", { name: "Je viens à Weekend musical" });
  await expect(coming).toBeVisible();

  // The session expires with the page open. The mocked backend checks the key
  // on every request, as a server checks its cookie.
  await page.evaluate(() => sessionStorage.removeItem("msw:user"));
  await coming.click();

  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion");

  await fillLogin(page, "demo.player", "demo");

  await expect(page).toHaveURL(/\/events$/);
  // The refused answer was rolled back, so it can be given again.
  await expect(coming).toHaveAttribute("aria-pressed", "false");
  await coming.click();
  await expect(coming).toHaveAttribute("aria-pressed", "true");
});
