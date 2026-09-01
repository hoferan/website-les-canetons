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

test("a member answers an event in one tap and can change it", async ({ page }) => {
  await login(page, "demo.user");
  await page.goto("/sinscrire");

  const first = page
    .getByRole("list", { name: "Événements à venir" })
    .getByRole("listitem")
    .first();

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
  await page.goto("/sinscrire");

  await expect(page.getByRole("button", { name: "Je participe" })).toHaveCount(0);
  await page.getByRole("link", { name: "Résumé" }).first().click();

  await expect(page.getByRole("heading", { name: "Résumé des inscriptions" })).toBeVisible();
});
