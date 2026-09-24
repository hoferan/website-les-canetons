import { expect, type Page, test } from "@playwright/test";

/**
 * The desktop bar's fold (#99), which only a real browser can check: jsdom
 * lays nothing out, so every entry "fits" there.
 *
 * AS demo.direction, whose bar is the longest there is (Événements first,
 * then every public page), and at 768px, the narrowest width that still gets
 * the desktop bar. Measured when this was written: at 860px everything fits
 * in both languages; at 768px Histoire and Galerie fold.
 */
async function logInAsDirection(page: Page, path: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill("demo.direction");
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: /^Compte de demo\.direction/ })).toBeVisible();
  await page.goto(path);
}

for (const { path, more, last } of [
  { path: "/events", more: "Plus", last: "Galerie" },
  { path: "/de/events", more: "Mehr", last: "Galerie" },
]) {
  test(`at 768px the bar folds into "${more}" and stays on one line (${path})`, async ({
    page,
  }) => {
    await logInAsDirection(page, path);
    await page.setViewportSize({ width: 768, height: 800 });

    const nav = page.getByRole("navigation", { name: /Navigation principale|Hauptnavigation/ });
    const trigger = nav.getByRole("button", { name: more, exact: true });
    await expect(trigger).toBeVisible();

    // ONE LINE: every visible bar entry, "Plus" and the avatar share a centre
    // line (the avatar is taller than the text, so tops differ). Before the
    // fold existed the bar wrapped to two lines here.
    const tops = await nav.evaluate((el) =>
      [...el.querySelectorAll("a, button")]
        .filter((node) => (node as HTMLElement).offsetParent !== null)
        .filter((node) => !node.closest("[aria-label='Langue'],[aria-label='Sprache']"))
        .map((node) => {
          const r = node.getBoundingClientRect();
          return Math.round((r.top + r.bottom) / 2 / 8);
        }),
    );
    expect(new Set(tops).size).toBe(1);

    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);

    // FOLDED FROM THE RIGHT: the least important entry is in the menu.
    await trigger.click();
    await expect(page.getByRole("menuitem").last()).toHaveText(last);
  });
}

test("at 1280px nothing folds", async ({ page }) => {
  await logInAsDirection(page, "/events");
  await page.setViewportSize({ width: 1280, height: 800 });

  const nav = page.getByRole("navigation", { name: "Navigation principale" });
  await expect(nav.getByRole("link", { name: "Galerie" })).toBeVisible();
  await expect(nav.getByRole("button", { name: "Plus", exact: true })).toHaveCount(0);
});
