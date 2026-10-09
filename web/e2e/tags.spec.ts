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

// #102 for the tag editor, as public.spec.ts does it for the contact form:
// only a real browser has interactive validation, and without `noValidate`
// Chromium never fires the submit, so nothing moves focus to the field.
test("a new tag without a French name is refused in the page's language", async ({ page }) => {
  await logIn(page, "demo.direction");
  await page.goto("/event-tags");

  const form = page.getByRole("form", { name: "Nouvelle catégorie" });
  await form.getByRole("button", { name: "Ajouter" }).click();

  await expect(form.getByText("Nom en français est obligatoire", { exact: true })).toBeVisible();
  await expect(form.getByLabel("Nom en français")).toBeFocused();
});

/**
 * Rule 2 of ui/button.tsx, for the switch. Only a real browser shows it:
 * jsdom keeps the focus on a button that turns disabled, and Chromium moves it
 * to <body>. A keyboard user who flips the confetti switch with Space must
 * still be on it once the save is through.
 *
 * MUTATION TEST: pass `disabled={busy}` to the switch in EventTags.tsx and
 * this fails.
 */
test("a tag's confetti switch keeps the focus through a Space flip", async ({ page }) => {
  await logIn(page, "demo.direction");
  await page.goto("/event-tags");

  const sortie = page.getByRole("switch", { name: /Sortie/ });
  await expect(sortie).not.toBeChecked();
  await sortie.focus();
  await page.keyboard.press("Space");

  await expect(sortie).toBeChecked();
  // Playwright counts aria-disabled as disabled, so this waits for the save.
  await expect(sortie).toBeEnabled();
  await expect(sortie).toBeFocused();
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

  await page.getByRole("link", { name: "Modifier les catégories" }).click();
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
