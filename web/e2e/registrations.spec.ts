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

  await page.getByRole("button", { name: "M’inscrire" }).click();

  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inscription enregistrée");
  await expect(page.getByText(/sophie\.bulliard@example\.ch/)).toBeVisible();

  // Signing in through the nav because the booking above exists only in this
  // page's mocked backend, and the page.goto in other specs' logIn would
  // reload it.
  await page.getByRole("link", { name: "Connexion" }).locator("visible=true").first().click();
  await page.getByLabel("Identifiant").fill("demo.committee");
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: "Compte de demo.committee" })).toBeVisible();

  await navLink(page, "Événements").click();
  await page.getByRole("link", { name: "Inscriptions à Souper de soutien" }).click();
  await expect(page).toHaveURL(/\/events\/7\/registrations$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Inscriptions");

  // Three bookings where the seed has two: the one made above is counted,
  // its two adults are added to the guests, and its CHF 90 to the total.
  await expect(page.getByTestId("guest-counts")).toHaveText(
    "3 inscriptions · 8 personnes · CHF 240.00 · 0\u00a0sur\u00a02\u00a0payées",
  );

  const cards = page.getByTestId("guest-cards").getByRole("listitem");
  await expect(cards).toHaveCount(3);
  const booked = cards.filter({ hasText: "Bulliard Sophie" });
  await expect(booked).toBeVisible();
  await expect(booked).toContainText("sophie.bulliard@example.ch");
  await expect(booked).toContainText("Table\u00a0: Avec les Python");

  // `registrations.view` is ALL the committee role grants: the list is
  // theirs to read, never to amend, cancel or mark paid.
  await expect(page.getByRole("button", { name: /^Annuler l’inscription de/ })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});
