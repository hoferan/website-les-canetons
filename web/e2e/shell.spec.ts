import { expect, test } from "@playwright/test";

test("the login page renders a usable form", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion");

  // Against the BUILT artifact and a real browser, so this is the check that a
  // green component suite cannot make: that the fields are labelled in the
  // rendered document and the submit is actually reachable. See
  // docs/traps.md — a passing assertion is not a rendered page.
  await expect(page.getByLabel("Identifiant")).toBeVisible();
  await expect(page.getByLabel("Mot de passe")).toBeVisible();

  const submit = page.getByRole("button", { name: "Se connecter" });
  await expect(submit).toBeVisible();
  // Never the disabled attribute: it blurs the focused control mid-submit.
  await expect(submit).toBeEnabled();
});

test("an unknown path renders the 404 view", async ({ page }) => {
  await page.goto("/some-unknown-path");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Page introuvable");
});
