import { expect, test } from "@playwright/test";

/**
 * The public site, in a real browser.
 *
 * WHY THESE EXIST ON TOP OF A GREEN COMPONENT SUITE. Four separate defects on
 * this project were invisible to Vitest and obvious the moment a page was
 * rendered — jsdom applies no CSS, so both responsive layouts are in the tree
 * at once and nothing is ever actually laid out. These pages are the ones a
 * stranger sees, and they are the ones nobody in the band would report.
 *
 * Against the MOCKED backend on its own port; see playwright.config.ts.
 */
test("the front door says what the band is and where to go next", async ({ page }) => {
  await page.goto("/");

  await expect(page.getByRole("heading", { level: 1 })).toContainText("depuis 2002");

  // Every destination has to lead somewhere. A card that 404s on the front
  // page is worse than no card.
  const destinations = page.getByRole("list", { name: "Découvrir les Canetons" });
  await expect(destinations.getByRole("link")).toHaveCount(4);
});

test("the nav reaches every public page, and each one renders its own heading", async ({
  page,
}) => {
  const pages = [
    { label: "Nous rejoindre", heading: "Tu veux commencer la guggen ?" },
    { label: "Les canetons", heading: "Nos Canetons" },
    { label: "Comité", heading: "Le comité" },
    { label: "Histoire", heading: "L’Histoire des Canetons" },
    { label: "Contact", heading: "Contact" },
  ];

  await page.goto("/");

  // SCOPED TO THE NAV, because the front page repeats four of these labels as
  // destination cards and an unscoped query matches both. `visible=true` on
  // top of that, because both responsive layouts are in the DOM at once: the
  // phone panel and the desktop bar are the same links twice over.
  const nav = page.getByRole("navigation", { name: "Navigation principale" });

  for (const entry of pages) {
    await nav.getByRole("link", { name: entry.label }).locator("visible=true").click();
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(entry.heading);
  }
});

test("the band page lists every register, including the empty ones", async ({ page }) => {
  await page.goto("/band");

  // Six registers come from reference data, so all six are on the page even
  // though only some have anybody who has consented to be named.
  await expect(page.getByRole("article")).toHaveCount(6);
  await expect(page.getByRole("navigation", { name: "Registres" }).getByRole("link")).toHaveCount(
    6,
  );
});

test("the contact form is usable and sends", async ({ page }) => {
  await page.goto("/contact");

  // getByLabel matches SUBSTRINGS in Playwright, unlike Testing Library's
  // getByLabelText — "Nom:" also matches "Prénom:" without `exact`.
  await page.getByLabel("Nom:", { exact: true }).fill("Rossier");
  await page.getByLabel("Prénom:", { exact: true }).fill("Claire");
  await page.getByLabel("E-mail:", { exact: true }).fill("claire@example.ch");
  await page.getByLabel("Sujet:", { exact: true }).fill("Une question");
  await page.getByLabel("Contenu du message:", { exact: true }).fill("Bonjour !");

  await page.getByRole("button", { name: "Envoyer" }).click();

  // The form token is fetched when the page renders, so by the time a person
  // has typed five fields it is old enough for the server to accept. That is
  // the ordering this test exercises and a component test cannot.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Message envoyé");
});

test("the public pages carry no horizontal overflow on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  for (const path of ["/", "/band", "/committee", "/history", "/join", "/contact"]) {
    await page.goto(path);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways at 390px`).toBeLessThanOrEqual(0);
  }
});
