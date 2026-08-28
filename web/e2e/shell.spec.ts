import { expect, test } from "@playwright/test";

test("the shell mounts in a real browser", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Les Canetons de Fribourg" })).toBeVisible();
});
