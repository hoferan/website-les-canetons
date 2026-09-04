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

// THE CONTROL E1's TOUCH PASS MISSED. Every text input in the admin event form
// carries min-h-touch and measures 44px; the "Weekend" checkbox carried no
// className at all and rendered at the browser default of 13x13 — in the one
// form the band actually uses one-handed, at a rehearsal, on a phone.
//
// Asserted over EVERY control in the form rather than over the checkbox alone.
// Pinning the one known offender would leave the next added control just as
// unguarded, and the defect here was never "this checkbox" — it was "a control
// slipped through". The unit suite cannot see any of it: jsdom has no layout.
test("every control in the admin event form clears the 44px touch floor", async ({ page }) => {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill("demo.admin");
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.includes("authentification"));
  await page.goto("/planning_repet");

  // Located by its heading, not getByRole("form"): a <form> exposes that role
  // only when it has an accessible name, and this one has none — so the role
  // query would fail here for a reason that has nothing to do with tap targets.
  const form = page
    .locator("form")
    .filter({ has: page.getByRole("heading", { name: "Ajouter un événement" }) });
  // count() does NOT auto-wait, unlike expect(). Without settling the form
  // first it returns 0 against a page React has not finished rendering, and the
  // test then fails on the guard below rather than on any tap target.
  await expect(form).toBeVisible();

  const controls = form.locator("input, select, textarea, button");
  const count = await controls.count();
  // A form that rendered no controls would otherwise pass this vacuously.
  expect(count).toBeGreaterThan(6);

  const undersized: string[] = [];
  for (let i = 0; i < count; i++) {
    const control = controls.nth(i);
    // What a finger hits, not what the control paints. A checkbox is allowed to
    // stay visually small as long as a WRAPPING label carries the target — that
    // is the normal way to do it, and demanding a 44px box would be absurd. A
    // label merely sitting BESIDE the input (htmlFor) does not count: the row
    // then has tappable text and a tappable box with a dead gap between them.
    const box = await control.evaluate((el) => {
      const target = el.closest("label") ?? el;
      const r = target.getBoundingClientRect();
      return {
        h: r.height,
        w: r.width,
        id: el.id || el.textContent?.trim().slice(0, 20) || el.tagName,
      };
    });
    if (box.h === 0 && box.w === 0) continue; // not rendered at this viewport
    if (box.h < 44) undersized.push(`${box.id}@${Math.round(box.h)}px`);
  }
  expect(undersized).toEqual([]);
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
