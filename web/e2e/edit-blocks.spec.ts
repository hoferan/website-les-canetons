import { expect, test, type Page } from "@playwright/test";

/**
 * The Direction fills in the booking number where it is shown (#106): the
 * floating pill, the contact card's chip, the card's editor, the toast, and
 * the number on the page as a phone link.
 *
 * Against the MOCKED backend, like every spec here. The mock keeps the blocks
 * in page memory, so the spec moves between pages by clicking rather than
 * with page.goto, which would reload it empty. The language switch does not
 * reload (ADR 0041), so a German page can be reached the same way.
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

  const chip = page.getByRole("button", {
    name: /^Modifier : Contact des Canetons, carte 1 sur 1$/,
  });
  await expect(chip).toHaveCount(0);
  await page.getByRole("button", { name: "Modifier la page" }).click();
  await chip.click();

  const dialog = page.getByRole("dialog", { name: "Comité · contact" });
  await dialog.getByLabel("Numéro").fill("026 123 45 67");
  await dialog.getByRole("button", { name: "Enregistrer" }).click();
  await expect(dialog).toBeHidden();
  const toast = page.locator("[data-sonner-toast]");
  await expect(toast.getByText("Modifié")).toBeVisible();

  // A toast over the button swallows the click that ends edit mode, for as
  // long as the pointer rests on it. Polled, because the toast is still
  // sliding in when it becomes visible.
  const done = page.getByRole("button", { name: "Terminer la modification" });
  await expect
    .poll(async () => {
      const [toastBox, doneBox] = [await toast.boundingBox(), await done.boundingBox()];
      if (toastBox === null || doneBox === null) return false;
      return (
        toastBox.y >= doneBox.y + doneBox.height ||
        toastBox.y + toastBox.height <= doneBox.y ||
        toastBox.x >= doneBox.x + doneBox.width ||
        toastBox.x + toastBox.width <= doneBox.x
      );
    })
    .toBe(true);

  const number = page.getByRole("link", { name: "026 123 45 67" });
  await expect(number).toHaveAttribute("href", "tel:+41261234567");
  await expect(page.locator("[data-tbd='booking-number']")).toHaveCount(0);
  // A phone number is no text, so the card still has all its German (#359).
  await expect(chip.locator("[data-flag]")).toHaveCount(0);

  // The bar's button ends it, and focus moves to the header's button that
  // takes its place.
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
    [...document.querySelectorAll("[data-chip], [data-action-bar]")].flatMap((chip) => {
      const c = chip.getBoundingClientRect();
      // A row of chips names its block with data-chip-scope; a lone chip sits
      // directly in its block, through the Indicator wrapper it may wear.
      const own = chip.parentElement!;
      const scope =
        chip.closest("[data-chip-scope]") ??
        (own.hasAttribute("data-indicator") ? own.parentElement! : own);
      const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
      const hits: string[] = [];
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        // A chip's own word is not the block's text. A closed one still has
        // boxes, clipped away inside its chip, and chipsOverChips covers the
        // chips themselves.
        if (
          node.parentElement!.closest("[data-chip], [data-action-bar]") ||
          node.textContent!.trim() === ""
        )
          continue;
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
    const chips = [...document.querySelectorAll("[data-chip], [data-action-bar]")].filter(
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
      expect(await page.locator("[data-chip], [data-action-bar]").count()).toBeGreaterThan(0);
      expect(await chipsOverText(page), `${path} at ${width}px`).toEqual([]);
      expect(await chipsOverChips(page), `${path} at ${width}px`).toEqual([]);
    }
  }
});

/**
 * Every action strip that runs past its card, and every word on one that is
 * cut, in pixels. A strip cannot spill by construction; a word can still end
 * in an ellipsis inside it.
 */
function stripProblems(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll("[data-action-bar='strip']")].flatMap((strip) => {
      const card = strip.closest("[data-chip-scope]")!.getBoundingClientRect();
      const s = strip.getBoundingClientRect();
      const name = strip.getAttribute("aria-label");
      const out =
        s.left < card.left - 1 || s.right > card.right + 1 ? [`${name} runs past its card`] : [];
      const cut = [...strip.querySelectorAll<HTMLElement>("[data-word]")]
        .filter((word) => word.scrollWidth > word.clientWidth + 1)
        .map((word) => `${name}: "${word.textContent}" is cut`);
      return [...out, ...cut];
    }),
  );
}

test("the home band's action strips stay inside their tiles and cut no word", async ({ page }) => {
  // ADR 0043: with ⋯ added, the old floating row needed 291px on a 237px tile
  // at 1024px and spilled over the next tile; German words are longer still.
  await page.addInitScript(() => sessionStorage.setItem("canetons.editMode", "1"));
  await logIn(page, "demo.direction");
  await page.locator('a[href="/"]:visible').first().click();

  for (const language of ["fr", "de"]) {
    if (language === "de") {
      await page.getByRole("link", { name: "Auf Deutsch wechseln" }).first().click();
      await expect(page).toHaveURL(/\/de\/?$/);
    }
    for (const width of [1280, 1024, 390]) {
      await page.setViewportSize({ width, height: 844 });
      await page.evaluate(() => document.fonts.ready);
      const strips = page.locator("[data-action-bar='strip']");
      await expect(strips.first()).toBeVisible();
      expect(await stripProblems(page), `${language} at ${width}px`).toEqual([]);
      // A hovered segment takes the room and shows its word, on a middle tile.
      if (width > 390) {
        for (const move of ["before", "after"]) {
          await strips.nth(1).locator(`[data-move="${move}"]`).hover();
          expect(await stripProblems(page), `${language} at ${width}px, ${move} hovered`).toEqual(
            [],
          );
        }
        await page.mouse.move(0, 0);
      }
    }
  }
});

test("a card is duplicated and deleted from the page, with no dialog but the question", async ({
  page,
}) => {
  await page.addInitScript(() => sessionStorage.setItem("canetons.editMode", "1"));
  await page.setViewportSize({ width: 1280, height: 844 });
  await logIn(page, "demo.direction");
  await page.locator('a[href="/join"]:visible').first().click();
  const headings = page.locator("[data-slot='card'] h2");
  await expect(headings).toHaveCount(5);

  await page.getByRole("button", { name: /^Plus d’actions\s: Horaires, carte 2 sur 5$/ }).click();
  await page.getByRole("menuitem", { name: "Dupliquer la carte" }).click();
  await expect(headings).toHaveText([
    "Instruments recherchés",
    "Horaires",
    "Horaires",
    "Critères d’âge",
    "Lieu",
    "Contacts",
  ]);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Modifier : Horaires, carte 3 sur 6" }),
  ).toBeFocused();

  await page.getByRole("button", { name: /^Plus d’actions\s: Horaires, carte 3 sur 6$/ }).click();
  await page.getByRole("menuitem", { name: "Supprimer la carte" }).click();
  await page
    .getByRole("alertdialog", { name: "Supprimer cette carte ?" })
    .getByRole("button", { name: "Supprimer" })
    .click();
  await expect(headings).toHaveCount(5);
  await expect(
    page.getByRole("button", { name: "Modifier : Critères d’âge, carte 3 sur 5" }),
  ).toBeFocused();
  // The page takes clicks again once the question has closed.
  await page.getByRole("button", { name: "Modifier : Lieu, carte 4 sur 5" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("moving a card from the keyboard keeps focus on that card's arrow", async ({ page }) => {
  await page.addInitScript(() => sessionStorage.setItem("canetons.editMode", "1"));
  await page.setViewportSize({ width: 1280, height: 844 });
  await logIn(page, "demo.direction");
  await page.locator('a[href="/join"]:visible').first().click();
  const headings = page.locator("[data-slot='card'] h2");
  const after = page.getByRole("button", {
    name: /^Déplacer « Instruments recherchés, carte \d sur 5 » après$/,
  });

  await after.focus();
  await page.keyboard.press("Enter");
  await expect(headings.nth(1)).toHaveText("Instruments recherchés");
  await expect(after).toBeFocused();

  // The same key moves it on.
  await page.keyboard.press("Enter");
  await expect(headings.nth(2)).toHaveText("Instruments recherchés");
  await expect(after).toBeFocused();

  // Moved to the front, the card's "avant" arrow is dimmed: its pencil takes the focus.
  const before = page.getByRole("button", {
    name: /^Déplacer « Instruments recherchés, carte \d sur 5 » avant$/,
  });
  for (const index of [1, 0]) {
    await before.focus();
    await page.keyboard.press("Enter");
    await expect(headings.nth(index)).toHaveText("Instruments recherchés");
  }
  await expect(before).toHaveAttribute("aria-disabled", "true");
  await expect(
    page.getByRole("button", { name: "Modifier : Instruments recherchés, carte 1 sur 5" }),
  ).toBeFocused();
});

// The editor's FR | DE (#368): the page, its preview, in German, with the
// edit still open, then saved from there.
test("the editor shows the German page with the edit open, and saves from there", async ({
  page,
}) => {
  await logIn(page, "demo.direction");
  await page.locator('a[href="/join"]:visible').first().click();
  await page.getByRole("button", { name: "Modifier la page" }).click();
  await page.getByRole("button", { name: "Modifier : Nous rejoindre · en-tête" }).click();

  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Titre FR" }).fill("Viens jouer avec nous");
  await dialog.getByRole("link", { name: "Aperçu en allemand" }).click();

  await expect(page).toHaveURL(/\/de\/join$/);
  await expect(dialog.getByRole("textbox", { name: "Titel FR" })).toHaveValue(
    "Viens jouer avec nous",
  );
  await dialog.getByRole("textbox", { name: "Titel DE" }).fill("Komm spiel mit uns");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Komm spiel mit uns");

  await dialog.getByRole("button", { name: "Speichern" }).click();
  await expect(dialog).toBeHidden();

  await page.getByRole("link", { name: "Passer en français" }).first().click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Viens jouer avec nous");
});
