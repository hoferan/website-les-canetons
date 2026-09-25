import { expect, test, type Page } from "@playwright/test";

/**
 * The history's two layout guards, which jsdom cannot see (#104's review).
 *
 * Against the MOCKED backend, like every spec here; see playwright.config.ts.
 */
async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

/**
 * A PASTED URL OR A GERMAN COMPOUND IS ONE UNBROKEN WORD, and at 390px it made
 * the whole page scroll sideways: 551px wide in the review.
 *
 * MUTATION TEST: drop `wrap-anywhere` from the entry's heading and text in
 * History.tsx and the overflow comes back.
 */
test("a long unbroken word does not push the phone page sideways", async ({ page }) => {
  await logIn(page, "demo.direction");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/history/new");

  await page.getByLabel(/^Année/).fill("2024");
  await page
    .getByLabel("Titre en français", { exact: true })
    .fill("Donaudampfschifffahrtsgesellschaftskapitänsmütze");
  await page
    .getByLabel("Texte en français", { exact: true })
    .fill("Voir https://www.example.org/une/tres/longue/adresse/sans/aucune/espace/du/tout");
  await page.getByRole("button", { name: "Enregistrer" }).click();

  await expect(page.getByTestId("history-timeline")).toContainText("Donaudampf");
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  // WRAPPING, NOT HYPHENATION, on the text: on a ragged-right column
  // hyphenation only split ordinary words ("oc-tobre") at every width.
  const hyphens = await page
    .getByTestId("history-timeline")
    .getByText(/^Voir https/)
    .evaluate((text) => getComputedStyle(text).hyphens);
  expect(hyphens).toBe("manual");
});

/**
 * THE CHECKED ICON SHOWS FOCUS. Its circle is filled with the same violet as
 * the focus ring, so without the white offset between them focus on the
 * selected icon, which is where focus nearly always is, was invisible.
 *
 * MUTATION TEST: drop `focus-within:ring-offset-2` from HistoryForm's icon
 * labels and the offset shadow disappears.
 */
test("focus on the selected icon is drawn apart from its fill", async ({ page }) => {
  await logIn(page, "demo.direction");
  await page.goto("/history/new");

  const checked = page.getByRole("radio", { name: "Aucune" });
  await expect(checked).toBeChecked();
  await checked.focus();

  const shadow = await checked.evaluate(
    (radio) => getComputedStyle(radio.closest("label") as HTMLElement).boxShadow,
  );
  // Two shadows: the white 2px offset, then the violet ring outside it.
  expect(shadow).toMatch(/rgb\(255, 255, 255\) 0px 0px 0px 2px/);
  expect(shadow).toMatch(/rgb\(75, 46, 214\) 0px 0px 0px 4px/);
});
