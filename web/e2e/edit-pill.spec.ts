import { expect, test, type Locator, type Page } from "@playwright/test";

/**
 * The edit-mode switch hides no text on a phone, at any scroll position.
 *
 * A pill floating over the page covered the end of a title or a line of card
 * text on every public page at 390px, at between 15 and 67 percent of scroll
 * positions, while the bottom of each page was clear. A check made only at the
 * bottom passed on the broken page, so this one walks the whole page.
 *
 * Two rules, because a docked bar and a floating pill differ in what they do:
 *
 * 1. At every scroll position the switch never lies directly on text. Text
 *    behind an opaque bar that holds the switch is out of view the way text
 *    below the screen's edge is, and the reader scrolls it into view.
 * 2. At the bottom of the page nothing more can scroll into view, so there the
 *    switch's fixed container overlaps no text at all.
 */

const PUBLIC_PAGES = ["/", "/agenda", "/band", "/committee", "/history", "/join", "/contact"];

const SWITCH = /^(Modifier la page|Terminer la modification)$/;

async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).not.toHaveURL(/\/login$/);
}

type Covered = { text: string; scrollY: number; rule: 1 | 2 };

/** Every text the switch covers on this page, walking it top to bottom. */
async function coveredText(toggle: Locator): Promise<Covered[]> {
  return toggle.evaluate(async (button) => {
    const covered: { text: string; scrollY: number; rule: 1 | 2 }[] = [];

    // The switch's fixed container: the pill itself, or the bar it sits in.
    let holder: Element = button;
    while (holder.parentElement && getComputedStyle(holder).position !== "fixed") {
      holder = holder.parentElement;
    }

    // Each text node's rectangles that overlap `box`, with the point at the
    // middle of each overlap.
    const overlaps = (box: DOMRect) => {
      const found: { node: Text; x: number; y: number }[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (
        let node = walker.nextNode() as Text | null;
        node;
        node = walker.nextNode() as Text | null
      ) {
        const parent = node.parentElement;
        if (!node.data.trim() || !parent || holder.contains(node)) continue;
        if (parent.closest(".sr-only, [aria-hidden='true']")) continue;
        const range = document.createRange();
        range.selectNodeContents(node);
        for (const rect of range.getClientRects()) {
          const left = Math.max(rect.left, box.left);
          const right = Math.min(rect.right, box.right);
          const top = Math.max(rect.top, box.top);
          const bottom = Math.min(rect.bottom, box.bottom);
          if (right > left && bottom > top) {
            found.push({ node, x: (left + right) / 2, y: (top + bottom) / 2 });
          }
        }
      }
      return found;
    };

    // 40px steps: the switch is 44px tall, so a line passing under it is
    // under it at one step at least. The bottom is read again at every step,
    // because photos still loading make the page longer during the walk.
    for (let step = 0; ; step += 40) {
      const max = document.documentElement.scrollHeight - innerHeight;
      const y = Math.min(step, max);
      window.scrollTo(0, y);
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

      for (const { node, x, y: pointY } of overlaps(button.getBoundingClientRect())) {
        // The first thing under the switch at that point. When it holds the
        // text, the switch lies directly on it.
        const under = document
          .elementsFromPoint(x, pointY)
          .find((element) => !button.contains(element));
        if (under?.contains(node)) {
          covered.push({ text: node.data.trim().slice(0, 60), scrollY: y, rule: 1 });
        }
      }

      if (y === document.documentElement.scrollHeight - innerHeight) {
        for (const { node } of overlaps(holder.getBoundingClientRect())) {
          covered.push({ text: node.data.trim().slice(0, 60), scrollY: y, rule: 2 });
        }
        return covered;
      }
    }
  });
}

for (const editing of [false, true]) {
  test(`at 390px the edit switch hides no text on the public pages, edit mode ${editing ? "on" : "off"}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 390, height: 844 });
    await logIn(page, "demo.direction");

    const toggle = page.getByRole("button", { name: SWITCH });
    const found: Record<string, Covered[]> = {};
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      await page.waitForLoadState("networkidle");
      if (editing && (await toggle.textContent())?.includes("Modifier la page")) {
        await toggle.click();
      }
      await expect(toggle).toHaveText(editing ? "Terminer la modification" : "Modifier la page");

      const covered = await coveredText(toggle);
      if (covered.length > 0) found[path] = covered.slice(0, 5);
    }
    expect(found).toEqual({});
  });
}
