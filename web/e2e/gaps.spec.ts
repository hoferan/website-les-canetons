import { expect, test } from "@playwright/test";

/**
 * A visitor reads no placeholder on any public page (#393, ADR 0048).
 *
 * Against the MOCKED backend, which has every kind of gap there is to leak:
 * nobody in Lyre has agreed to appear, most photo slots are empty, and the
 * booking number and the joining contacts ship empty. Each page is waited on
 * by its heading and then by the network, because a count of zero also
 * passes before anything has rendered.
 */
const PAGES = [
  "/",
  "/band",
  "/committee",
  "/join",
  "/agenda",
  "/history",
  "/contact",
  "/de/",
  "/de/band",
  "/de/committee",
  "/de/join",
];

for (const path of PAGES) {
  test(`a visitor reads no placeholder on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // The roster, the blocks and the photo slots all arrive after the heading.
    await page.waitForLoadState("networkidle");

    await expect(page.locator("[data-tbd]")).toHaveCount(0);
    await expect(page.locator("[data-photo-pending]")).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText(
      /à compléter|zu ergänzen|Photo à venir|Foto folgt/,
    );
  });
}
