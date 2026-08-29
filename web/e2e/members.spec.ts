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
test("a guard bounce returns you to the page you wanted", async ({ page }) => {
  await page.goto("/sinscrire");
  await expect(page.getByRole("heading", { name: "Authentification" })).toBeVisible();

  await page.getByLabel("Identifiant :").fill("demo.user");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();

  await expect(page.getByRole("heading", { name: "Événements à venir" })).toBeVisible();
});

test("a member answers an event and the list remembers", async ({ page }) => {
  await login(page, "demo.user");
  await page.goto("/sinscrire");

  await page.getByRole("link", { name: "S’inscrire" }).first().click();
  await page.getByLabel("Participation :").selectOption("participate");
  await page.getByRole("button", { name: "Confirmer" }).click();

  await expect(page.getByRole("heading", { name: "Événements à venir" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Choix enregistré" }).first()).toBeVisible();
});

test("an admin reads the summary instead of answering", async ({ page }) => {
  await login(page, "demo.admin");
  await page.goto("/sinscrire");

  await expect(page.getByRole("link", { name: "S’inscrire" })).toHaveCount(0);
  await page.getByRole("link", { name: "Résumé" }).first().click();

  await expect(page.getByRole("heading", { name: "Résumé des inscriptions" })).toBeVisible();
});
