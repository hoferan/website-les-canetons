import { expect, test } from "@playwright/test";

test("the shell mounts in a real browser", async ({ page }) => {
  await page.goto("/");
  // The page's OWN h1, not the header's brand — the brand stopped being a
  // heading when every route grew a real page title and the document ended up
  // with two h1s. This assertion is the stronger one anyway: it proves the
  // router, the layout and the page all mounted, not just the chrome.
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Bienvenue sur notre site");
  await expect(page.getByRole("banner")).toContainText("Canetons");
});
