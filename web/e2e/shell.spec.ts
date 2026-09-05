import { expect, test } from "@playwright/test";

test("the login page renders its heading", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion");
});

test("an unknown path renders the 404 view", async ({ page }) => {
  await page.goto("/some-unknown-path");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page introuvable");
});
