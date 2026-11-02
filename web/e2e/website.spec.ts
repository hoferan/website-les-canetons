import { expect, test, type Page } from "@playwright/test";

/**
 * The website goes out as a file and comes back (#336): a number stored on
 * /committee survives an export, a reload that empties the mocked backend,
 * and an import of the downloaded file.
 *
 * Against the MOCKED backend, like every spec here. Its memory lives in the
 * page, so a reload stands in for "another server". The real round trip
 * between two databases is in the PR.
 */
async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

test("a site exported, then imported into an empty one, shows the same booking number", async ({
  page,
}, testInfo) => {
  await logIn(page, "demo.direction");
  await page.locator('a[href="/committee"]:visible').first().click();
  await page.getByRole("button", { name: "Modifier la page" }).click();
  await page
    .getByRole("button", { name: "Modifier le texte : numéro pour les prestations" })
    .click();
  await page.getByRole("dialog").getByLabel("Texte").fill("026 123 45 67");
  await page.getByRole("dialog").getByRole("button", { name: "Enregistrer" }).click();
  await expect(page.getByRole("link", { name: "026 123 45 67" })).toBeVisible();

  await page.getByRole("button", { name: "Compte de demo.direction" }).click();
  await page.getByRole("menuitem", { name: "Site web" }).click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger le site" }).click(),
  ]);
  const file = testInfo.outputPath("site.zip");
  await download.saveAs(file);

  // The mocked backend starts over: the number is gone.
  await page.reload();
  await page.locator('a[href="/committee"]:visible').first().click();
  await expect(page.locator("[data-tbd='booking-number']")).toBeVisible();

  await page.getByRole("button", { name: "Compte de demo.direction" }).click();
  await page.getByRole("menuitem", { name: "Site web" }).click();
  await page.getByLabel("Fichier du site").setInputFiles(file);
  await expect(page.getByRole("region", { name: "Contenu du fichier" })).toContainText("1 texte");
  await page.getByRole("button", { name: "Remplacer le site" }).click();
  const dialog = page.getByRole("alertdialog");
  await dialog.getByRole("textbox").fill("REMPLACER");
  await dialog.getByRole("button", { name: "Remplacer le site" }).click();
  await expect(page.getByText(/Site importé/)).toBeVisible();

  await page.locator('a[href="/committee"]:visible').first().click();
  await expect(page.getByRole("link", { name: "026 123 45 67" })).toBeVisible();
});
