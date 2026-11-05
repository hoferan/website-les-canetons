import { expect, type Locator, test } from "@playwright/test";

/**
 * The quiet button's press (ADR 0040), in a real browser: jsdom applies no
 * stylesheet, so only a browser can say where the word, its line and its
 * patch end up. The word drops onto its line; the line and the patch stay.
 */
async function pressed(button: Locator) {
  await button.hover();
  await button.page().mouse.down();
  // Let the transition finish before reading.
  await button.page().waitForTimeout(400);
  const styles = await button.evaluate((element) => {
    // Tailwind 4 moves things with the `translate` property, not `transform`.
    const down = (style: CSSStyleDeclaration) =>
      style.translate === "none" ? 0 : parseFloat(style.translate.split(" ")[1] ?? "0");
    const own = getComputedStyle(element);
    const behind = getComputedStyle(element, "::before");
    return {
      move: down(own),
      behindMove: down(behind),
      line: behind.backgroundSize,
      patch: behind.backgroundColor,
      decoration: own.textDecorationLine,
    };
  });
  await button.page().mouse.up();
  return styles;
}

test("a quiet button's word drops onto its line while the line and the patch stay put", async ({
  page,
}) => {
  await page.goto("/dev/ui");
  const button = page.getByRole("button", { name: "Réinitialiser" }).first();
  await expect(button).toBeVisible();

  const resting = await button.evaluate((element) => {
    const behind = getComputedStyle(element, "::before");
    return { line: behind.backgroundSize, patch: behind.backgroundColor };
  });
  // The line is drawn behind the word, not as a text underline that would
  // travel with it.
  expect(resting.line).toContain("2px");

  const down = await pressed(button);
  expect(down.move).toBe(3);
  // The layer behind moves back by as much, so the line and the patch hold.
  expect(down.behindMove).toBe(-3);
  // The line keeps its weight under the finger.
  expect(down.line).toBe(resting.line);
  // The patch darkens.
  expect(down.patch).not.toBe(resting.patch);
  expect(down.decoration).toBe("none");
});

test("an icon-only quiet button gets the patch and the drop but no line", async ({ page }) => {
  await page.goto("/login");
  const toggle = page.getByRole("button", { name: /Afficher le mot de passe/ });
  await expect(toggle).toBeVisible();
  const line = await toggle.evaluate(
    (element) => getComputedStyle(element, "::before").backgroundImage,
  );
  expect(line).toBe("none");
  const down = await pressed(toggle);
  expect(down.move).toBe(3);
  expect(down.behindMove).toBe(-3);
});
