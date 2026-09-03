import { expect, test } from "@playwright/test";

// 390x844, the phone this page was designed against. /canetons is public, so
// none of this needs a session.
//
// WHAT THIS FILE IS FOR. Canetons.test.tsx already asserts that every index
// link's href matches a section id, and that is the assertion that catches a
// renamed anchor. What it CANNOT do is prove the link moves the page: jsdom has
// no layout and no scrolling, so a `scroll-mt` that stopped applying, an id on
// the wrong element, or a chip too small to tap all pass it. Everything here is
// a measurement, and every one of them is invisible to the unit suite.
test.use({ viewport: { width: 390, height: 844 } });

const REGISTERS = [
  "Direction",
  "Batteurs",
  "Grosses-caisses",
  "Lyre",
  "Cloches",
  "Trompettes",
  "Trombones",
];

test("every index link scrolls the page to its own register", async ({ page }) => {
  await page.goto("/canetons");
  const index = page.getByRole("navigation", { name: "Registres" });

  // The whole list, not one representative. A dead anchor renders perfectly and
  // scrolls nowhere, so the only honest check is that each of the seven lands
  // on the heading it names.
  for (const label of REGISTERS) {
    const link = index.getByRole("link", { name: label });
    // Read the target out of the link's own href rather than hard-coding the
    // ids here: this then fails when a chip and its section disagree, instead
    // of when someone renames both consistently.
    const id = (await link.getAttribute("href"))!.slice(1);

    await link.click();

    const box = (await page.locator(`#${id}`).boundingBox())!;

    // Near the top of the viewport, not merely somewhere on the page. The upper
    // bound is loose because the last register cannot reach the very top -- the
    // page bottoms out first -- and the lower bound is what fails if the anchor
    // is dead and nothing moved.
    expect(box.y, `${label} should be scrolled near the top`).toBeLessThan(150);
    expect(box.y).toBeGreaterThan(-1);
  }
});

test("a fresh load of a hashed URL lands on its own register, not scrollY 0", async ({ page }) => {
  // ScrollToTop.tsx: a browser cannot honour a fragment on a fresh SPA load —
  // the target section doesn't exist yet when the hash is parsed — so this is
  // the component's own job now, on mount, not the router-navigation case the
  // first test above covers. Same bounds as that test: near the top, not
  // merely on the page, with the same loose upper bound because the last
  // register cannot reach the very top.
  await page.goto("/canetons#trombones");

  // toBeInViewport auto-retries: ScrollToTop deliberately waits on
  // document.fonts.ready before scrolling (see its doc comment — scrolling any
  // earlier under-scrolls, because the self-hosted font swap that follows
  // first paint still reflows the page), so the jump lands a beat after
  // load, not before it. A one-shot boundingBox() read here would race that
  // and fail even though the fix works — this is what caught it.
  await expect(page.locator("#trombones")).toBeInViewport();

  const box = (await page.locator("#trombones").boundingBox())!;
  expect(box.y, "Trombones should be scrolled near the top on a fresh load").toBeLessThan(150);
  expect(box.y).toBeGreaterThan(-1);
});

test("the jump leaves the register readable, not flush against the top", async ({ page }) => {
  await page.goto("/canetons");

  await page
    .getByRole("navigation", { name: "Registres" })
    .getByRole("link", { name: "Cloches" })
    .click();

  // scroll-mt-6. A jumped-to heading pinned at y=0 reads as clipped, and this
  // is the assertion that fails if that utility is dropped -- the unit suite
  // sees the class either way.
  const box = (await page.locator("#bells").boundingBox())!;
  expect(box.y).toBeGreaterThan(0);
  expect(page.url()).toContain("#bells");
});

test("the index chips are big enough to tap", async ({ page }) => {
  await page.goto("/canetons");
  const links = page.getByRole("navigation", { name: "Registres" }).getByRole("link");

  await expect(links).toHaveCount(7);
  for (const link of await links.all()) {
    // 44px is the floor the E1 phone pass set for every tappable thing.
    const box = (await link.boundingBox())!;
    expect(
      box.height,
      `"${await link.textContent()}" is below the 44px floor`,
    ).toBeGreaterThanOrEqual(44);
  }
});

test("a pending photograph costs a line, not a photograph's worth of height", async ({ page }) => {
  await page.goto("/canetons");
  const pending = page.locator("[data-photo-pending]");

  await expect(pending).toHaveCount(8);

  // E2a's decision, MEASURED. PhotoPending.test.tsx can only assert the absence
  // of a `min-h-` class, which is a proxy; this is the actual rendered height.
  // It was a 160px minimum, and eight of them were 1280px -- 42% of the page.
  for (const box of await pending.all()) {
    expect((await box.boundingBox())!.height).toBeLessThan(100);
  }
});

test("the index does not push the page sideways on a phone", async ({ page }) => {
  await page.goto("/canetons");

  // WAIT FOR THE MOUNT BEFORE MEASURING. page.evaluate does not auto-wait the
  // way a locator does, so without this the geometry is read off an empty
  // document, where scrollWidth trivially equals clientWidth and the assertion
  // passes no matter what the page does. Verified: dropping `flex-wrap` takes
  // the document to 634px against a 390px viewport, and this test only sees
  // that once the nav is on screen.
  await expect(page.getByRole("navigation", { name: "Registres" })).toBeVisible();

  // Seven chips in a row are exactly the kind of thing that overflows a 390px
  // viewport. They wrap; this is what fails if they ever stop wrapping.
  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});
