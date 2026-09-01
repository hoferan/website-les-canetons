import { expect, test } from "@playwright/test";

// 390x844 — the iPhone-class viewport every finding in the E1 spec was measured
// at. The unit suite cannot see any of this: it asserts roles and text, and the
// text was always present in the DOM even when it rendered underneath a button.
test.use({ viewport: { width: 390, height: 844 } });

test("the phone menu opens, and its rows are big enough to tap", async ({ page }) => {
  await page.goto("/");

  const trigger = page.getByRole("button", { name: "Menu de navigation" });
  await expect(trigger).toBeVisible();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");

  await trigger.click();
  await expect(trigger).toHaveAttribute("aria-expanded", "true");

  const accueil = page.getByRole("link", { name: "Accueil" });
  await expect(accueil).toBeVisible();

  // 44px is the floor; the nav rows are specified at 48.
  const box = (await accueil.boundingBox())!;
  expect(box.height).toBeGreaterThanOrEqual(44);
});

test("the event controls do not cover the date on a phone", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  // Waiting for the session to land before navigating: without it the next goto
  // races the login and the page renders with no admin controls at all, which
  // shows up as boundingBox() failing on a button that was never rendered.
  //
  // The signal is the REDIRECT, not the nav's username link that
  // members.spec.ts waits for. That link is real but hidden at this width --
  // the phone nav is collapsed behind the hamburger -- so waiting for it here
  // would time out on a session that had in fact been established. Waiting for
  // the route to leave the login page is true at any viewport.
  await page.waitForURL((url) => !url.pathname.includes("authentification"));
  await page.goto("/planning_repet");

  const first = page.getByRole("list", { name: "Événements" }).getByRole("listitem").first();
  const heading = first.getByRole("heading");
  const remove = first.getByRole("button", { name: /^Supprimer/ });

  const headingBox = (await heading.boundingBox())!;
  const removeBox = (await remove.boundingBox())!;

  // THE REGRESSION TEST FOR THE DEFECT E1 EXISTS FOR. The controls were
  // `absolute top-2 right-2` and rendered on top of the date -- "dimanche 20
  // se[Modifier]2(". Asserting the boxes do not intersect is the only kind of
  // assertion that could have caught it.
  const overlaps =
    removeBox.x < headingBox.x + headingBox.width &&
    removeBox.x + removeBox.width > headingBox.x &&
    removeBox.y < headingBox.y + headingBox.height &&
    removeBox.y + removeBox.height > headingBox.y;
  expect(overlaps).toBe(false);
});
