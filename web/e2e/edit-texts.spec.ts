import { expect, test, type Page } from "@playwright/test";

/**
 * The Direction fills in the booking number where it is shown (#106).
 *
 * Against the MOCKED backend, like every spec here. The mock keeps the texts
 * in page memory, so the spec moves between pages by clicking rather than
 * with page.goto, which would reload it empty. The language switch reloads
 * too, so the German page is Committee.test.tsx's.
 */
async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

test("the booking number is stored from /committee, and edit mode ends with Terminer", async ({
  page,
}) => {
  await logIn(page, "demo.direction");
  await page.locator('a[href="/committee"]:visible').first().click();
  await expect(page.locator("[data-tbd='booking-number']")).toBeVisible();

  await page.getByRole("button", { name: "Modifier la page" }).click();
  await expect(page.getByRole("region", { name: "Mode édition" })).toBeVisible();
  await page
    .getByRole("button", { name: "Modifier le texte : numéro pour les prestations" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Texte").fill("026 123 45 67");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();

  const number = page.getByRole("link", { name: "026 123 45 67" });
  await expect(number).toHaveAttribute("href", "tel:+41261234567");
  await expect(page.locator("[data-tbd='booking-number']")).toHaveCount(0);

  await page.getByRole("button", { name: "Terminer" }).click();
  await expect(page.getByRole("button", { name: /^Modifier le texte/ })).toHaveCount(0);
  await expect(number).toBeVisible();
});
