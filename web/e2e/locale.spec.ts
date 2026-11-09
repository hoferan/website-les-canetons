import { expect, test } from "@playwright/test";

/**
 * The German mount, in a real browser (#159).
 *
 * Changing locale is a navigation inside the app (#369), which the component
 * suite proves in switchInPlace.test.tsx. What only a browser shows is below:
 * a German URL loaded cold, the document's metadata, the stored preference
 * meeting main.tsx's redirect on the next visit, and the absence of a reload.
 *
 * The existing French specs are untouched and keep using bare paths, which is
 * also the regression this must not cause: `playwright.config.ts` sets a
 * `baseURL`, so `/agenda` still means French.
 */

test("the German mount renders German and says so in the document", async ({ page }) => {
  await page.goto("/de");

  // What a screen reader picks its voice from, corrected at boot by main.tsx.
  await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");
  // In the navigation: the home page hero links to the agenda by the same name.
  await expect(
    page
      .getByRole("navigation", { name: "Hauptnavigation" })
      .getByRole("link", { name: "Wo Sie uns sehen" }),
  ).toBeVisible();
});

test("French stays French, which is the regression a basename can cause", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
  await expect(
    page
      .getByRole("navigation", { name: "Navigation principale" })
      .getByRole("link", { name: "Où nous voir" }),
  ).toBeVisible();
});

test("THE SWITCH ROUND-TRIPS, AND KEEPS THE PAGE", async ({ page }) => {
  // The whole point of prefixed URLs: switching language moves you to the
  // SAME page in the other one, not to a home page.
  await page.goto("/agenda");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Où nous voir");

  await page.getByRole("link", { name: "Auf Deutsch wechseln" }).click();

  await expect(page).toHaveURL(/\/de\/agenda$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wo Sie uns sehen");

  await page.getByRole("link", { name: "Passer en français" }).click();

  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Où nous voir");
});

test("/fr opens the French page, under its address without the prefix", async ({ page }) => {
  await page.goto("/fr/agenda");

  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page).not.toHaveURL(/\/fr\//);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Où nous voir");
});

test("the switch does not reload the page, and keeps what was typed", async ({ page }) => {
  await page.goto("/contact");
  await page.getByLabel("Prénom").fill("Anna");
  // Gone if the browser loads the document again.
  await page.evaluate(() => Object.assign(window, { stillTheSamePage: true }));

  await page.getByRole("link", { name: "Auf Deutsch wechseln" }).click();

  await expect(page).toHaveURL(/\/de\/contact$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Kontakt");
  await expect(page.getByLabel("Vorname")).toHaveValue("Anna");
  // The metadata follows without a load as well.
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Kinder-Guggenmusik aus Freiburg/,
  );
  expect(await page.evaluate(() => "stillTheSamePage" in window)).toBe(true);
});

test("SWITCHING BACK FROM THE GERMAN ROOT DOES NOT BOUNCE ON THE NEXT VISIT", async ({ page }) => {
  // The trap preference.ts's docblock warns about. Reaching /de stores
  // "de-CH"; a later visit to "/" meets main.tsx's shouldRedirectToGerman(),
  // which sends the visitor to /de unless switching to French stored "fr".
  //
  // Deleting rememberLocale outright leaves this test passing: with nothing
  // ever stored there is nothing to bounce on. The mutation that fails is
  // breaking only the French direction, `if (target !== "fr")
  // rememberLocale(target)`.
  await page.goto("/");
  await page.getByRole("link", { name: "Auf Deutsch wechseln" }).click();
  await expect(page).toHaveURL(/\/de$/);

  await page.getByRole("link", { name: "Passer en français" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/");

  await expect(page).toHaveURL(/\/$/);
  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
});

test("every page publishes both alternates and an x-default", async ({ page }) => {
  await page.goto("/agenda");

  const alternates = page.locator("head link[rel='alternate']");
  await expect(alternates).toHaveCount(3);

  const origin = new URL(page.url()).origin;
  await expect(page.locator("head link[hreflang='fr-CH']")).toHaveAttribute(
    "href",
    `${origin}/agenda`,
  );
  await expect(page.locator("head link[hreflang='de-CH']")).toHaveAttribute(
    "href",
    `${origin}/de/agenda`,
  );
  // x-default is what a crawler uses when it matches no listed language, and
  // for a Fribourg band that is French.
  await expect(page.locator("head link[hreflang='x-default']")).toHaveAttribute(
    "href",
    `${origin}/agenda`,
  );
});

test("the session survives the switch", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill("demo.direction");
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto("/events");
  await page.getByRole("link", { name: "Auf Deutsch wechseln" }).click();

  // The members' page stays open, now in German.
  await expect(page).toHaveURL(/\/de\/events$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Planung");
});

/**
 * The shell's own metadata, corrected at boot (#172).
 *
 * IN A BROWSER RATHER THAN jsdom because the thing being tested is the static
 * document — what Apache served before any of our code ran — being patched on
 * top of. The component suite mounts the tags itself, so it can prove the
 * function and not the wiring.
 *
 * THE TITLE IS NOT ASSERTED AS *DIFFERENT*, deliberately. It is identical in
 * both catalogues: "Les Canetons de Fribourg" is the band's name and
 * "Guggenmusik" is already German, so there is nothing in it left to render.
 * See the note at `meta` in web/src/i18n/fr.ts.
 */
test("a German page carries German metadata and the German manifest", async ({ page }) => {
  await page.goto("/de/agenda");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Wo Sie uns sehen");

  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /Kinder-Guggenmusik aus Freiburg/,
  );

  // What an installed app launches from. Without this it always opened at "/",
  // putting a German member back into French every single time.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/assets/icons/manifest.de.json",
  );
  // The attribute that must survive the swap: without it the manifest fetch
  // fails behind TEST/QA Basic Auth. Previously fixed bug.
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "crossorigin",
    "use-credentials",
  );
});

test("a French page is left exactly as the shell shipped it", async ({ page }) => {
  await page.goto("/agenda");

  await expect(page).toHaveTitle("Guggenmusik Les Canetons de Fribourg");
  await expect(page.locator('meta[name="description"]')).toHaveAttribute(
    "content",
    /La guggenmusik des enfants de Fribourg/,
  );
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    "href",
    "/assets/icons/manifest.json",
  );
});

/**
 * VISIBLE ON A PHONE WITHOUT OPENING THE MENU (#99). It used to be the last row
 * behind the hamburger, where a German-speaking parent on the French front
 * page had to go looking for it.
 */
test("on a phone the switch is visible without opening the menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  await expect(page.getByRole("button", { name: "Menu de navigation" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await page.getByRole("link", { name: "Auf Deutsch wechseln" }).click();
  await expect(page).toHaveURL(/\/de\/?$/);
});
