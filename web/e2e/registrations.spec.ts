import { expect, type Page, test } from "@playwright/test";

/**
 * A stranger booking a place at the souper, and the committee reading the
 * guest list it lands on.
 *
 * Against the MOCKED backend on its own port; see playwright.config.ts. The
 * booking lives in the page's module state, so the guest list is reached by
 * in-app links from the same page: a `page.goto` after the booking would
 * reload the module and read the seed again, and the new booking with it.
 *
 * The seed's souper (event 7) is open for bookings and already carries two:
 * five guests at CHF 150.00 and one unpriced guest. The counts below are that
 * seed plus the booking made here.
 */

function navLink(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name })
    .locator("visible=true");
}

/** Signs in through the nav, which keeps the page and its mocked bookings. */
async function logInInPlace(page: Page, username: string) {
  await page.getByRole("link", { name: "Connexion" }).locator("visible=true").first().click();
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

test("a visitor books the souper from the agenda, and the committee finds them on the guest list", async ({
  page,
}) => {
  await page.goto("/agenda");
  await page.getByRole("link", { name: "S’inscrire — Souper de soutien" }).click();
  await expect(page).toHaveURL(/\/events\/7\/book$/);

  // getByLabel matches substrings, so `exact` on the short labels: "Nom"
  // would also match "Prénom".
  await page.getByLabel("Nom", { exact: true }).fill("Bulliard");
  await page.getByLabel("Prénom", { exact: true }).fill("Sophie");
  await page.getByLabel("E-mail", { exact: true }).fill("sophie.bulliard@example.ch");
  await page.getByLabel("Téléphone", { exact: true }).fill("079 555 12 34");
  await page.getByLabel("Table", { exact: true }).fill("Avec les Python");

  // The running total is what a guest reads before deciding, so it is
  // checked before the submit.
  await page.getByLabel("Repas adulte").fill("2");
  await expect(page.getByTestId("booking-total")).toHaveText("2 personnes — CHF 90.00");

  // The souper's questions after its menus (ADR 0032): answered once for the
  // whole booking.
  await page.getByRole("group", { name: "Végétarien ?" }).getByLabel("Oui").check();
  await page.getByLabel("Tiramisu").check();

  await page.getByRole("button", { name: "M’inscrire" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inscription enregistrée");
  await expect(page.getByText(/sophie\.bulliard@example\.ch/)).toBeVisible();

  // Signing in through the nav because the booking above exists only in this
  // page's mocked backend, and the page.goto in other specs' logIn would
  // reload it.
  await logInInPlace(page, "demo.committee");

  await navLink(page, "Événements").click();
  await page.getByRole("link", { name: "Inscriptions à Souper de soutien" }).click();
  await expect(page).toHaveURL(/\/events\/7\/registrations$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inscriptions");

  // Three bookings where the seed has two: the one made above is counted,
  // its two adults are added to the guests, and its CHF 90 to the total.
  await expect(page.getByTestId("guest-counts")).toHaveText(
    "3 inscriptions · 8 personnes · CHF 240.00 · 0\u00a0sur\u00a02\u00a0payées",
  );

  // The cards themselves, not every list item: a card lists its answers too.
  const cards = page.getByTestId("guest-cards").locator(":scope > li");
  await expect(cards).toHaveCount(3);
  const booked = cards.filter({ hasText: "Bulliard Sophie" });
  await expect(booked).toBeVisible();
  await expect(booked).toContainText("sophie.bulliard@example.ch");
  await expect(booked).toContainText("Table\u00a0: Avec les Python");
  await expect(booked.getByTestId("guest-answers")).toContainText("V\u00e9g\u00e9tarien ? : Oui");
  await expect(booked.getByTestId("guest-answers")).toContainText("Dessert : Tiramisu");

  // The tally beside the kitchen's: the seed's Jeanne took the meringue.
  await expect(page.getByTestId("answer-totals")).toContainText("Dessert : 1 \u00d7 Tiramisu");
  await expect(page.getByTestId("answer-totals")).toContainText(
    "Dessert : 1 \u00d7 Meringue et double cr\u00e8me",
  );

  // `registrations.view` is ALL the committee role grants: the list is
  // theirs to read, never to amend, cancel or mark paid.
  await expect(page.getByRole("button", { name: /^Annuler l’inscription de/ })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});

test("a new booking reaches the committee's inbox, and reading the guest list clears it", async ({
  page,
}) => {
  // The seed's bookings start out read, so only this one is news (#123).
  await page.goto("/events/7/book");
  await page.getByLabel("Nom", { exact: true }).fill("Bulliard");
  await page.getByLabel("Prénom", { exact: true }).fill("Sophie");
  await page.getByLabel("E-mail", { exact: true }).fill("sophie.bulliard@example.ch");
  await page.getByLabel("Téléphone", { exact: true }).fill("079 555 12 34");
  await page.getByLabel("Repas adulte").fill("2");
  await page.getByRole("button", { name: "M’inscrire" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inscription enregistrée");

  await logInInPlace(page, "demo.committee");
  const account = page.getByRole("button", { name: /^Compte de demo\.committee/ });
  await account.click();
  await page.getByRole("menuitem", { name: "Boîte de réception" }).click();

  const item = page.getByTestId("inbox-item").filter({ hasText: "Souper de soutien" });
  await expect(item).toContainText("Inscriptions");
  await expect(item).toContainText("1 nouvelle");
  await item.getByRole("link").click();

  await expect(page).toHaveURL(/\/events\/7\/registrations$/);
  const cards = page.getByTestId("guest-cards").locator(":scope > li");
  await expect(cards.filter({ hasText: "Bulliard Sophie" })).toContainText(
    "nouvelle depuis la lecture",
  );
  await page.getByTestId("booking-read").getByRole("button", { name: "Marquer comme lu" }).click();
  await expect(page.getByTestId("booking-read")).toContainText("Aucun changement depuis");
  await expect(page.getByText("nouvelle depuis la lecture")).toHaveCount(0);

  await account.click();
  await page.getByRole("menuitem", { name: "Boîte de réception" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Boîte de réception");
  await expect(page.getByTestId("inbox-item").filter({ hasText: "Souper de soutien" })).toHaveCount(
    0,
  );
});
