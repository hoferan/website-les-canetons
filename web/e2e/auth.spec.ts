import { expect, test } from "@playwright/test";

test("logging in through the form makes the session live without a reload", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();

  // The nav shows the username, which only happens once GET /api/user has been
  // refetched — i.e. once the login invalidated it.
  await expect(page.getByRole("link", { name: "demo.admin" })).toBeVisible();
});

test("a wrong password is refused in French and stays on the form", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("pas-le-bon");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("alert")).toContainText("mot de passe incorrect");
  await expect(page.getByLabel("Identifiant :")).toBeVisible();
});

test("a guard sends you to login and login sends you back", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: "demo.admin" })).toBeVisible();

  // The admin form on the planning page is the visible proof the capability
  // survived the round trip.
  await page.goto("/planning_repet");
  await expect(page.getByLabel("Date :")).toBeVisible();
});

test("logging out ends the session", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: "demo.admin" })).toBeVisible();

  await page.goto("/authentification_inscription");
  await page.getByRole("button", { name: "Se déconnecter" }).click();

  await expect(page.getByRole("link", { name: "Connexion" })).toBeVisible();
  await page.goto("/planning_repet");
  await expect(page.getByLabel("Date :")).toHaveCount(0);
});

test("the contact form sends and lands on the confirmation page", async ({ page }) => {
  await page.goto("/contact");
  // `exact: true` on every field, not just the one that currently collides.
  // Playwright's default label match is a case-insensitive SUBSTRING — unlike
  // Testing Library's, which is why the same labels work unqualified in
  // Contact.test.tsx. "nom:" is the tail of "Prénom:", so a plain
  // getByLabel("Nom:") matches both and fails strict mode. The other four
  // happen not to collide today; a sixth field could make any of them
  // ambiguous, and the failure would look like a bug in the page.
  await page.getByLabel("Nom:", { exact: true }).fill("Canard");
  await page.getByLabel("Prénom:", { exact: true }).fill("Donald");
  await page.getByLabel("E-mail:", { exact: true }).fill("donald@example.com");
  await page.getByLabel("Sujet:", { exact: true }).fill("Une question");
  await page.getByLabel("Contenu du message:", { exact: true }).fill("Bonjour les canetons !");
  await page.getByRole("button", { name: "Envoyer" }).click();

  await expect(
    page.getByRole("heading", { name: "Formulaire envoyé avec succès !" }),
  ).toBeVisible();
});
