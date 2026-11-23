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

// Visitors see the home tiles and the form panels; a member sees the form of
// an event only members may book (event 4); direction manages every list.
const VISITS: Array<{ user: string | null; paths: string[] }> = [
  { user: null, paths: ["/", "/contact", "/events/7/book", "/login"] },
  { user: "demo.player", paths: ["/events/4/book"] },
  { user: "demo.direction", paths: ["/events", "/members", "/roles", "/registers", "/event-tags"] },
];

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

      for (const { user, paths } of VISITS) {
        await page.context().clearCookies();
        if (user) await logIn(page, user);
        for (const path of paths) {
          const url = path === "/" ? prefix || "/" : prefix + path;
          await page.goto(url);
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await page.waitForLoadState("networkidle");
          const { panels, pageOverflows } = await panelsOnPage(page);
          expect.soft(pageOverflows, `${url} scrolls sideways`).toBe(false);
          for (const panel of panels) all.push({ ...panel, where: `${user ?? "visitor"} ${url}` });
        }
      }

      // The seed has to show panels at all, or every check below passes empty.
      expect(all.length).toBeGreaterThan(30);
      for (const panel of all) {
        const label = `"${panel.text}" on ${panel.where}`;
        expect.soft(panel.isSurface, `${label} is a Surface`).toBe(true);
        expect.soft(panel.radius, `${label} radius`).toBe("18px");
        expect.soft(panel.overflows, `${label} overflows`).toBe(false);
      }
    });
  }
}

for (const width of [375, 1280]) {
  test(`each home tile takes focus in turn and its ring measures at least 3:1, at ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    const tiles = page.locator("li[data-confetti-avoid] > a");
    await expect(tiles).toHaveCount(4);
    const names = await tiles.evaluateAll((links) => links.map((link) => link.textContent));

    // Tab from the link before the first tile: the four tiles come next, in
    // the order they are read.
    await tiles.first().focus();
    await page.keyboard.press("Shift+Tab");
    const reached: Array<{ name: string | null; slot?: string; ring: string; contrast: number }> =
      [];
    for (let step = 0; step < 4; step++) {
      await page.keyboard.press("Tab");
      reached.push(
        await page.evaluate(() => {
          const link = document.activeElement as HTMLElement;
          const style = getComputedStyle(link);
          const channels = (colour: string) =>
            (colour.match(/[\d.]+/g) ?? []).slice(0, 3).map((value) => Number(value) / 255);
          const luminance = (colour: string) =>
            channels(colour)
              .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
              .reduce((sum, c, index) => sum + c * ([0.2126, 0.7152, 0.0722][index] ?? 0), 0);
          // The ring sits 2px outside the tile, on whatever the band paints.
          let ground: Element | null = link.parentElement;
          while (ground && getComputedStyle(ground).backgroundColor === "rgba(0, 0, 0, 0)") {
            ground = ground.parentElement;
          }
          const back = ground ? getComputedStyle(ground).backgroundColor : "rgb(255, 255, 255)";
          const [ring, under] = [luminance(style.outlineColor), luminance(back)];
          return {
            name: link.textContent,
            slot: link.dataset.slot,
            ring: `${style.outlineStyle} ${style.outlineWidth}`,
            contrast: (Math.max(ring, under) + 0.05) / (Math.min(ring, under) + 0.05),
          };
        }),
      );
    }
    expect(reached.map((tile) => tile.name)).toEqual(names);
    for (const tile of reached) {
      expect.soft(tile.slot, `${tile.name} is a Surface`).toBe("surface");
      expect.soft(tile.ring, `${tile.name} ring`).toBe("solid 2px");
      expect.soft(tile.contrast, `${tile.name} ring contrast`).toBeGreaterThanOrEqual(3);
    }
  });
}
