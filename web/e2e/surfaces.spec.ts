import { expect, type Page, test } from "@playwright/test";

/**
 * Every bordered panel is a Surface with the one radius (#386), measured in a
 * real browser: jsdom has no layout.
 *
 * A panel is found by its look, not its markup: any element in <main> at
 * least 120px wide and 40px tall, with the same border on all four sides (2px
 * or more, or dashed) and a rounded corner, that is not a control, a
 * button-styled link or a picture. So a panel written by hand again is caught
 * here.
 */

type Panel = {
  text: string;
  isSurface: boolean;
  radius: string;
  overflows: boolean;
};

async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await page.waitForURL((url) => !url.pathname.endsWith("/login"));
}

function panelsOnPage(page: Page): Promise<{ panels: Panel[]; pageOverflows: boolean }> {
  return page.evaluate(() => {
    const panels: Panel[] = [];
    for (const element of document.querySelectorAll<HTMLElement>("main *")) {
      if (element.matches("img, [data-slot=button]")) continue;
      if (element.closest("input, select, textarea, button, label, [role=radio], [role=switch]")) {
        continue;
      }
      const box = element.getBoundingClientRect();
      if (box.width < 120 || box.height < 40) continue;
      const style = getComputedStyle(element);
      const widths = [
        style.borderTopWidth,
        style.borderRightWidth,
        style.borderBottomWidth,
        style.borderLeftWidth,
      ];
      if (new Set(widths).size > 1) continue;
      // A 1px solid edge is a control, such as the planning's segmented
      // switch; a dashed one of any width is a placeholder panel.
      if (parseFloat(style.borderTopWidth) < 2 && style.borderTopStyle !== "dashed") continue;
      if (style.borderTopStyle === "none" || parseFloat(style.borderTopLeftRadius) < 4) continue;
      panels.push({
        text: element.innerText.trim().slice(0, 30).replace(/\s+/g, " "),
        isSurface: element.dataset.slot === "surface",
        radius: style.borderTopLeftRadius,
        overflows: element.scrollWidth > element.clientWidth + 1,
      });
    }
    return {
      panels,
      pageOverflows: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
}

const PAGES = ["/events", "/members", "/roles", "/registers", "/event-tags"];

for (const width of [375, 1280]) {
  for (const language of ["fr", "de"] as const) {
    test(`every panel is one Surface with one radius, ${language.toUpperCase()} at ${width}px`, async ({
      page,
    }) => {
      // A walk over several pages, like the badge one: past 30 s on CI.
      test.slow();
      await page.setViewportSize({ width, height: 900 });
      const prefix = language === "de" ? "/de" : "";
      const all: Array<Panel & { where: string }> = [];

      await logIn(page, "demo.direction");
      for (const path of PAGES) {
        await page.goto(prefix + path);
        await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
        await page.waitForLoadState("networkidle");
        const { panels, pageOverflows } = await panelsOnPage(page);
        expect.soft(pageOverflows, `${prefix}${path} scrolls sideways`).toBe(false);
        for (const panel of panels) all.push({ ...panel, where: `${prefix}${path}` });
      }

      // The seed has to show panels at all, or every check below passes empty.
      expect(all.length).toBeGreaterThan(20);
      for (const panel of all) {
        const label = `"${panel.text}" on ${panel.where}`;
        expect.soft(panel.isSurface, `${label} is a Surface`).toBe(true);
        expect.soft(panel.radius, `${label} radius`).toBe("18px");
        expect.soft(panel.overflows, `${label} overflows`).toBe(false);
      }
    });
  }
}

test("the four variants on /dev/ui share one radius", async ({ page }) => {
  await page.goto("/dev/ui");
  const surfaces = page.getByTestId("surfaces").locator("[data-slot=surface]");
  await expect(surfaces).toHaveCount(4);
  const looks = await surfaces.evaluateAll((elements) =>
    elements.map((element) => {
      const style = getComputedStyle(element);
      return [style.borderTopLeftRadius, style.borderTopWidth, style.borderTopStyle].join(" ");
    }),
  );
  expect(looks).toEqual(["18px 2px solid", "18px 3px solid", "18px 3px solid", "18px 2px dashed"]);
});
