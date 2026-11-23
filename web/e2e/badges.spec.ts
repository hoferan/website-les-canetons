import { expect, type Page, test } from "@playwright/test";

/**
 * Every status and category pill is a Badge (#385), measured in a real
 * browser: jsdom has no layout and no painted colours.
 *
 * The pills were built three ways and measured 17 computed styles between
 * them. Here a "pill" is found by its look, not by its markup: any element in
 * <main> with text, at most 34px tall, rounded to at least half its height,
 * and not a control. So a pill written by hand again is caught here even if it
 * slips past the ESLint rule.
 */

type Pill = {
  text: string;
  isBadge: boolean;
  signature: string;
  height: number;
  expectedHeight: number;
  clips: boolean;
  outside: boolean;
  contrast: number;
};

async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
}

function pillsOnPage(page: Page): Promise<Pill[]> {
  return page.evaluate(() => {
    const channels = (colour: string) =>
      (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map((value) => Number(value) / 255);
    const luminance = (colour: string) => {
      const weights = [0.2126, 0.7152, 0.0722];
      return channels(colour)
        .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
        .reduce((sum, c, index) => sum + c * (weights[index] ?? 0), 0);
    };
    const ratio = (a: string, b: string) => {
      const [first, second] = [luminance(a), luminance(b)];
      return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
    };

    const pills: Pill[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("main *")) {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width === 0 || box.height === 0 || box.height > 34) continue;
      if (parseFloat(style.borderTopLeftRadius) < box.height / 2 - 0.5) continue;
      if (element.closest("button, a, label, input, select, [role=radio], [role=switch]")) continue;
      if (element.querySelector("button, a, input")) continue;
      const text = element.innerText.trim();
      if (text === "") continue;

      const card = element.parentElement?.closest("li, article, section") ?? document.body;
      const edge = Math.min(card.getBoundingClientRect().right, window.innerWidth);
      const border = parseFloat(style.borderTopWidth);
      pills.push({
        text,
        isBadge: element.dataset.slot === "badge",
        signature: [
          style.fontSize,
          style.fontWeight,
          `${box.height}px`,
          style.paddingTop,
          style.paddingLeft,
          style.borderTopWidth,
        ].join(" "),
        height: box.height,
        // One line of text, its padding and its border: anything taller wrapped.
        expectedHeight:
          parseFloat(style.lineHeight) + 2 * parseFloat(style.paddingTop) + 2 * border,
        clips: element.scrollWidth > element.clientWidth + 1,
        outside: box.right > edge + 0.5,
        contrast: ratio(style.color, style.backgroundColor),
      });
    }
    return pills;
  });
}

const PAGES = ["/events", "/members", "/event-tags", "/events/7/registrations"];

for (const width of [375, 1280]) {
  for (const language of ["fr", "de"] as const) {
    test(`every pill is one Badge, on one line and readable, ${language.toUpperCase()} at ${width}px`, async ({
      page,
    }) => {
      // Two logins and eight pages, each waiting for the network to settle:
      // on CI's four busy workers that ran past the default 30 s.
      test.slow();
      await page.setViewportSize({ width, height: 900 });
      const prefix = language === "de" ? "/de" : "";
      const all: Array<Pill & { where: string }> = [];

      // Direction manages every page; the committee reads the guest list, which
      // shows it the payment badge in place of the switch.
      for (const user of ["demo.direction", "demo.committee"]) {
        await page.context().clearCookies();
        await logIn(page, user);
        for (const path of PAGES) {
          await page.goto(prefix + path);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await page.waitForLoadState("networkidle");
          for (const pill of await pillsOnPage(page)) {
            all.push({ ...pill, where: `${user} ${prefix}${path}` });
          }
        }
      }

      // The seed has to show pills at all, or every check below passes empty.
      expect(all.length).toBeGreaterThan(10);
      for (const pill of all) {
        const label = `"${pill.text}" on ${pill.where}`;
        expect.soft(pill.isBadge, `${label} is a Badge`).toBe(true);
        expect
          .soft(pill.height, `${label} stays on one line`)
          .toBeLessThanOrEqual(pill.expectedHeight + 0.5);
        expect.soft(pill.clips, `${label} is not clipped`).toBe(false);
        expect.soft(pill.outside, `${label} stays inside its card`).toBe(false);
        expect.soft(pill.contrast, `${label} text contrast`).toBeGreaterThanOrEqual(4.5);
      }
      // sm and md, each with one height, weight and padding whatever the tone.
      const signatures = [...new Set(all.map((pill) => pill.signature))];
      expect(signatures.length, signatures.join("\n")).toBeLessThanOrEqual(4);
    });
  }
}
