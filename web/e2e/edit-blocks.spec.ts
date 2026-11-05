import { expect, test, type Page } from "@playwright/test";

/**
 * The Direction fills in the booking number where it is shown (#106): the
 * floating pill, the contact card's chip, the card's editor, the toast, and
 * the number on the page as a phone link.
 *
 * Against the MOCKED backend, like every spec here. The mock keeps the blocks
 * in page memory, so the spec moves between pages by clicking rather than
 * with page.goto, which would reload it empty. The language switch reloads
 * too, so the German page is Committee.test.tsx's.
 */
async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

test("the booking number is stored from the contact card on /committee, and Terminer ends edit mode", async ({
  page,
}) => {
  await logIn(page, "demo.direction");
  await page.locator('a[href="/committee"]:visible').first().click();
  await expect(page.locator("[data-tbd='booking-number']")).toBeVisible();

  const chip = page.getByRole("button", { name: "Modifier : Contact des Canetons" });
  await expect(chip).toHaveCount(0);
  await page.getByRole("button", { name: "Modifier la page" }).click();
  await chip.click();

  const dialog = page.getByRole("dialog", { name: "Comité · contact" });
  await dialog.getByLabel("Numéro").fill("026 123 45 67");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator("[data-sonner-toast]").getByText("Modifié")).toBeVisible();

  const number = page.getByRole("link", { name: "026 123 45 67" });
  await expect(number).toHaveAttribute("href", "tel:+41261234567");
  await expect(page.locator("[data-tbd='booking-number']")).toHaveCount(0);

  // One element whose label changes, so it is the same button that ends it.
  await page.getByRole("button", { name: "Terminer la modification" }).click();
  await expect(page.getByRole("button", { name: "Modifier la page" })).toBeFocused();
  await expect(page.getByRole("button", { name: /^Modifier : / })).toHaveCount(0);
  await expect(number).toBeVisible();
});

/**
 * Every chip's overlap with the text of the block it sits on, in pixels. The
 * text is measured line by line through a Range, so the empty end of a short
 * line does not count. jsdom has no layout, so only a browser can check this.
 */
function chipsOverText(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-chip]")].flatMap((chip) => {
      const c = chip.getBoundingClientRect();
      // A row of chips names its block with data-chip-scope; a lone chip sits
      // directly in its block.
      const scope = chip.closest("[data-chip-scope]") ?? chip.parentElement!;
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      const hits: string[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (chip.contains(node) || node.textContent!.trim() === "") continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const line of range.getClientRects()) {
          const x = Math.min(line.right, c.right) - Math.max(line.left, c.left);
          const y = Math.min(line.bottom, c.bottom) - Math.max(line.top, c.top);
          if (x > 0 && y > 0)
            hits.push(
              `${chip.getAttribute("aria-label") ?? chip.textContent} covers "${node.textContent!.trim()}"`,
            );
        }
      }
      return hits;
    }),
  );
}

/**
 * Every pair of chips that overlap, in pixels: a row of chips must push its
 * neighbours aside, never lie on them. Hidden chips (a phone's other arrow
 * glyph, a closed menu) have no box and are left out.
 */
function chipsOverChips(page: Page) {
  return page.evaluate(() => {
    const chips = [...document.querySelectorAll("[data-chip]")].filter(
      (chip) => chip.getBoundingClientRect().width > 0,
    );
    const hits: string[] = [];
    chips.forEach((a, i) => {
      for (const b of chips.slice(i + 1)) {
        const r = a.getBoundingClientRect();
        const q = b.getBoundingClientRect();
        const x = Math.min(r.right, q.right) - Math.max(r.left, q.left);
        const y = Math.min(r.bottom, q.bottom) - Math.max(r.top, q.top);
        if (x > 0 && y > 0) {
          hits.push(`${a.getAttribute("aria-label")} on ${b.getAttribute("aria-label")}`);
        }
      }
    });
    return hits;
  });
}

test("no edit chip covers the text of its block, on a phone or a desktop", async ({ page }) => {
  // Measured before the fix: the home hero's chip covered "guggen d'enfants"
  // at 1280, the join hero's covered "Tu veux commencer" at 390, and the card
  // chips sat 3px into their headings.
  await page.addInitScript(() => sessionStorage.setItem("canetons.editMode", "1"));
  await logIn(page, "demo.direction");

  for (const width of [1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    for (const path of ["/", "/agenda", "/band", "/committee", "/history", "/join", "/contact"]) {
      // A router navigation, not page.goto: the mocked session lives in page
      // memory, and the phone's menu hides the links.
      await page.evaluate((to) => {
        history.pushState({}, "", to);
        dispatchEvent(new PopStateEvent("popstate"));
      }, path);
      await expect(page.getByRole("button", { name: /^Modifier : / }).first()).toBeVisible();
      // The roster and fonts settle the layout after the first paint.
      await page.evaluate(() => document.fonts.ready);
      // Every public page has at least one chip, so a selector that matched
      // nothing could not pass for "no overlap".
      expect(await page.locator("[data-chip]").count()).toBeGreaterThan(0);
      expect(await chipsOverText(page), `${path} at ${width}px`).toEqual([]);
      expect(await chipsOverChips(page), `${path} at ${width}px`).toEqual([]);
    }
  }
});

test("a card's pencil shows its word beside the arrows, never over them", async ({ page }) => {
  // Measured before the fix: at 1280 the arrows sat in a box of their own
  // and the hovered pencil grew over the "après" arrow beside it.
  await page.addInitScript(() => sessionStorage.setItem("canetons.editMode", "1"));
  await page.setViewportSize({ width: 1280, height: 844 });
  await logIn(page, "demo.direction");
  await page.locator('a[href="/join"]:visible').first().click();

  const pencil = page.getByRole("button", { name: "Modifier : Horaires" });
  await pencil.hover();
  await expect(pencil.getByText("Modifier")).toBeVisible();
  const after = await page
    .getByRole("button", { name: "Déplacer « Horaires » après" })
    .boundingBox();
  const word = await pencil.boundingBox();
  expect(after!.x + after!.width).toBeLessThanOrEqual(word!.x);
  expect(await chipsOverChips(page)).toEqual([]);
  expect(await chipsOverText(page)).toEqual([]);
});

test("moving a card from the keyboard keeps focus on that card's arrow", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("canetons.editMode", "1"));
  await page.setViewportSize({ width: 1280, height: 844 });
  await logIn(page, "demo.direction");
  await page.locator('a[href="/join"]:visible').first().click();
  const headings = page.locator("[data-slot='card'] h2");
  const after = page.getByRole("button", { name: "Déplacer « Instruments recherchés » après" });

  await after.focus();
  await page.keyboard.press("Enter");
  await expect(headings.nth(1)).toHaveText("Instruments recherchés");
  await expect(after).toBeFocused();

  // The same key moves it on.
  await page.keyboard.press("Enter");
  await expect(headings.nth(2)).toHaveText("Instruments recherchés");
  await expect(after).toBeFocused();

  // Moved to the front, the card has no "avant" arrow left: its pencil takes the focus.
  const before = page.getByRole("button", { name: "Déplacer « Instruments recherchés » avant" });
  for (const index of [1, 0]) {
    await before.focus();
    await page.keyboard.press("Enter");
    await expect(headings.nth(index)).toHaveText("Instruments recherchés");
  }
  await expect(before).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Modifier : Instruments recherchés" }),
  ).toBeFocused();
});
