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
  // exact: true — Playwright's default label match is a case-insensitive
  // substring, and "nom:" is literally the tail of "Prénom:", so a plain
  // getByLabel("Nom:") hits both fields (strict-mode violation).
  await page.getByLabel("Nom:", { exact: true }).fill("Canard");
  await page.getByLabel("Prénom:").fill("Donald");
  await page.getByLabel("E-mail:").fill("donald@example.com");
  await page.getByLabel("Sujet:").fill("Une question");
  await page.getByLabel("Contenu du message:").fill("Bonjour les canetons !");
  await page.getByRole("button", { name: "Envoyer" }).click();

  await expect(
    page.getByRole("heading", { name: "Formulaire envoyé avec succès !" }),
  ).toBeVisible();
});
