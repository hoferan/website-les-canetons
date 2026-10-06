import { expect, type Page, test } from "@playwright/test";

/**
 * Event tags (#107), in a real browser against the mocked backend.
 *
 * Every step after a write moves through the app (a save, a link, Back)
 * rather than page.goto(): the mocked store lives in the page, and a reload
 * would put the seed back.
 */
async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

function card(page: Page, title: string) {
  return page
    .getByTestId("event-card")
    .filter({ has: page.getByTestId("event-title").getByText(title, { exact: true }) });
}

test("a tag put on an event shows on its card and narrows the planning", async ({ page }) => {
  await logIn(page, "demo.direction");
  // Vendanges Cheyres, which the seed tags Sortie.
  await page.goto("/events/5/edit");

  const picker = page.getByRole("group", { name: "Catégories" });
  await picker.getByRole("button", { name: "Carnaval" }).click();
  await page.getByRole("button", { name: "Enregistrer", exact: true }).click();

  await expect(page).toHaveURL(/\/events$/);
  const cheyres = card(page, "Vendanges Cheyres");
  await expect(cheyres.getByTestId("event-meta").getByText("Carnaval")).toBeVisible();

  await page.getByRole("radio", { name: "Carnaval" }).click();
  await expect(page.getByTestId("event-title")).toHaveText([
    "Sortie de fin de saison",
    "Vendanges Cheyres",
  ]);
});

/**
 * A name at the forty-character cap stays on a 320px screen.
 *
 * It does not even need to wrap: measured 2026-10-06, such a chip is 246px
 * wide inside a 288px card, so it stays on one line. TagChip's `break-words`
 * is a backstop for a name past the cap, which the API refuses. This test
 * guards the cap together with the layout. Raise the cap and type the longer
 * name here, or it keeps passing over a chip that no longer fits.
 */
test("a tag at the forty-character cap stays on a small phone's screen", async ({ page }) => {
  // Logged in at the default width, where the account button is in the bar
  // rather than inside the phone's menu.
  await logIn(page, "demo.direction");
  await page.setViewportSize({ width: 320, height: 640 });
  await page.goto("/events");

  await page.getByRole("link", { name: "Gérer les catégories" }).click();
  await page.getByRole("button", { name: "Modifier « Sortie »" }).click();
  // Scoped to the rows: the new-tag form below has a field of the same name.
  const rows = page.getByTestId("event-tag-row");
  await rows.getByLabel("Nom en français").fill("Sortie officielle du cortège de la ville");
  await rows.getByRole("button", { name: "Enregistrer" }).click();
  await expect(rows.getByLabel("Nom en français")).toHaveCount(0);

  await page.goBack();
  const cheyres = card(page, "Vendanges Cheyres");
  const chip = cheyres.getByText("Sortie officielle du cortège de la ville");
  await expect(chip).toBeVisible();

  // Both edges against the screen's, at the narrowest phone still about.
  // Neither the document's scrollWidth nor the card's own edge can see this:
  // measured 2026-10-06 with the chip set to nowrap, the scrollWidth stayed at
  // 320 and the card simply widened with its chip, off the side of the phone.
  const chipBox = await chip.boundingBox();
  const cardBox = await cheyres.boundingBox();
  expect(chipBox!.x + chipBox!.width).toBeLessThanOrEqual(320);
  expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(320);
});
