import { expect, test } from "@playwright/test";

/**
 * The German mount, in a real browser (#159).
 *
 * THIS IS THE ONLY PLACE THE SWITCH IS PROVEN END TO END. Changing locale is a
 * full page load, and jsdom implements no navigation — `window.location` is
 * non-configurable in that setup, so the component suite can assert the
 * destination and the stored preference but never the arrival. Everything
 * below is the half only a browser can see.
 *
 * The existing French specs are untouched and keep using bare paths, which is
 * also the regression this must not cause: `playwright.config.ts` sets a
 * `baseURL`, so `/agenda` still means French.
 */

test("the German mount renders German and says so in the document", async ({ page }) => {
  await page.goto("/de");

  // What a screen reader picks its voice from, corrected at boot by main.tsx.
  await expect(page.locator("html")).toHaveAttribute("lang", "de-CH");
  await expect(page.getByRole("link", { name: "Wo Sie uns sehen" })).toBeVisible();
});

test("French stays French, which is the regression a basename can cause", async ({ page }) => {
  await page.goto("/");

  await expect(page.locator("html")).toHaveAttribute("lang", "fr-CH");
  await expect(page.getByRole("link", { name: "Où nous voir" })).toBeVisible();
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

  // And back, which is the direction that bounces if the stored preference is
  // written after the navigation rather than before: "/de/agenda" → "/agenda"
  // is fine, but "/de" → "/" would meet main.tsx's redirect.
  await page.getByRole("link", { name: "Passer en français" }).click();

  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Où nous voir");
});

test("SWITCHING BACK FROM THE GERMAN ROOT DOES NOT BOUNCE", async ({ page }) => {
  // The exact trap preference.ts's docblock warns about. Reaching /de stores
  // "de-CH"; switching to French lands on "/", where main.tsx asks
  // shouldRedirectToGerman() — which would send the visitor straight back if
  // rememberLocale("fr") had not already run.
  //
  // MUTATION TEST, AND THE OBVIOUS ONE DOES NOT WORK. Deleting
  // rememberLocale outright leaves this test PASSING: with nothing ever
  // stored there is nothing to bounce on, because the first click is also
  // what records "de-CH". The mutation that does fail is breaking only the
  // French direction — `if (target !== "fr") rememberLocale(target)` — which
  // is what "remembered after the navigation" actually looks like from here.
  // Checked both ways rather than assumed.
  await page.goto("/");
  await page.getByRole("link", { name: "Auf Deutsch wechseln" }).click();
  await expect(page).toHaveURL(/\/de$/);

  await page.getByRole("link", { name: "Passer en français" }).click();

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

  // A full page load, so the cookie is what carries the session across it —
  // and the members' nav is what proves it did.
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
