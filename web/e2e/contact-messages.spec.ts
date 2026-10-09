import { expect, test, type Page } from "@playwright/test";

async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

// Message 3 in the mock is from Isabelle Dupasquier, whose name in the display
// font is 304px wide: more than the 322px header row leaves beside a 44px
// button and its 8px gap on a 390px phone. A wrapping row put the close button
// 64px lower, under the e-mail at the left edge (#265).
test("an opened message keeps its close button beside a long name on a phone", async ({ page }) => {
  await logIn(page, "demo.direction");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/contact-messages?open=3");

  const panel = page.getByTestId("message-panel");
  const name = panel.getByRole("heading", { level: 2, name: "Isabelle Dupasquier" });
  const close = panel.getByRole("button", { name: "Fermer" });
  await expect(name).toBeVisible();
  // The widths above are the display font's, so measure once it is in.
  await page.evaluate(() => document.fonts.ready);

  const nameBox = await name.boundingBox();
  const closeBox = await close.boundingBox();
  expect(closeBox?.y).toBe(nameBox?.y);
  expect(closeBox!.x).toBeGreaterThanOrEqual(nameBox!.x + nameBox!.width);
  expect(closeBox?.width).toBeGreaterThanOrEqual(44);
  expect(closeBox?.height).toBeGreaterThanOrEqual(44);

  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);
});
