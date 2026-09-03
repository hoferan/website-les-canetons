import { expect, test } from "@playwright/test";

// 390x844, the phone every E1 and E2 finding was measured at. The home route is
// public, so none of this needs a session. The mocked backend has the souper
// flag ON and one upcoming event, so the page renders in its fullest state —
// which is the state most likely to overflow.
test.use({ viewport: { width: 390, height: 844 } });

// PROVEN, not assumed: adding `whitespace-nowrap` to the description <span> in
// DestinationCards.tsx (a long French sentence that can no longer wrap) turns
// this red — scrollWidth 502 against clientWidth 390. What does NOT turn it
// red: forcing the grid to `grid-cols-2` unconditionally at 390px leaves
// scrollWidth === clientWidth === 390, because CSS grid tracks shrink to fit
// and the card text just wraps into a taller, narrower cell — two-up alone
// produces no overflow to catch. This guard is only tripped by content that
// CANNOT shrink — a nowrap string, a fixed min-width, a table — not by a
// layout that merely gets tighter.
test("the front door does not scroll sideways on a phone", async ({ page }) => {
  await page.goto("/");

  // WAIT FOR THE MOUNT BEFORE MEASURING. page.evaluate does not auto-wait the
  // way a locator does, and on an empty document scrollWidth trivially equals
  // clientWidth — the assertion would pass no matter what the page does.
  await expect(page.getByRole("list", { name: "Découvrir les Canetons" })).toBeVisible();

  // The list's name lives on a real, visible <h2> now, not just in
  // aria-label — this was the defect the fix addresses: the section used to
  // have an accessible name nothing on screen carried, so the four cards read
  // as a continuation of "Prochain événement" above them. A locator query
  // alone (above) cannot catch that regression; this can.
  await expect(page.getByRole("heading", { name: "Découvrir les Canetons" })).toBeVisible();

  const { scrollWidth, clientWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(clientWidth);
});

test("the hero's own footprint stays within a phone's budget", async ({ page }) => {
  await page.goto("/");

  // NOT an above-the-fold assertion. The souper card is deliberately FIRST on
  // this page while its flag is on (see Accueil.tsx) — on this fixture it
  // measures ~458px of the 844px viewport by itself, which pushes the badge to
  // y≈639, the <h1> to y≈804 and the sentence to y≈964. There is no hero height
  // that fits below a 458px card within an 844px screen, so a test asserting
  // the hero is on the first screen contradicts the page's own approved order
  // — that was test 2's original mistake, not a defect in the page. What is
  // actually worth guarding is the hero's OWN footprint, independent of
  // whatever sits above it, true in both the flag-on and flag-off states.
  //
  // Two things are pinned by nothing else: the badge's `w-48 sm:w-64` and the
  // <h1>'s `text-3xl sm:text-4xl`, both sized down specifically so the hero
  // does not eat a phone screen (see the comments in Accueil.tsx). Measured on
  // this fixture: badge y=639 h=141, h1 y=804 h=144, sentence y=964 h=112 —
  // badge width 192px (w-48), block height (sentence bottom minus badge top)
  // 436.95px.
  //
  // WHAT THIS BUDGET DOES AND DOES NOT GUARD, established by mutation:
  // - Forcing the <h1> to text-4xl (badge unchanged) grows heroHeight to only
  //   452.95px — the heading wraps to the same 4 lines at either size (see the
  //   Accueil.tsx comment), so this only adds 4px of line-height × 4 lines.
  //   Nothing near 480, or even a materially tightened bound, can catch a
  //   heading-only regression without sitting within ~15px of the 436.95px
  //   baseline — which is exactly the kind of margin that turns a real test
  //   into a flaky one. This budget cannot guard the heading's size; the
  //   Accueil.tsx comment above the <h1> is the record of that, not this test.
  // - Reverting the badge to w-64 (the pre-E2b size, heading unchanged) grows
  //   heroHeight to 483.94px — a real regression this budget can and should
  //   catch, but the OLD 480px bound caught it by 3.94px of luck, not design:
  //   close enough to font-hinting or sub-pixel layout jitter to be
  //   unreliable. 460px leaves 23px of headroom above the 436.95px baseline
  //   (comfortably clear of jitter, and not within ~15px of it) and 24px of
  //   margin below the 483.94px badge regression — a bound chosen on purpose
  //   instead of one that happened to work. It is still redundant with the
  //   explicit `badgeBox.width` assertion below, which is the more precise and
  //   more direct guard for that same regression; this one is the coarse
  //   aggregate backstop.
  const badge = page.getByAltText("Le logo des Canetons de Fribourg");
  const heading = page.getByRole("heading", { level: 1 });
  const sentence = page.getByText(/pas besoin de connaître la musique/);

  await expect(heading).toBeVisible();

  const badgeBox = (await badge.boundingBox())!;
  const sentenceBox = (await sentence.boundingBox())!;

  // w-48 is 192px; w-64 — what the badge was before E2b, and the obvious thing
  // for someone to "restore" — is 256px. This pins the responsive decision.
  expect(badgeBox.width, "the badge should be the narrow, sub-sm size").toBeLessThanOrEqual(200);

  // From the badge's top to the sentence's bottom: the badge, the <h1> and the
  // sentence together, whatever sits above them.
  const heroHeight = sentenceBox.y + sentenceBox.height - badgeBox.y;
  expect(
    heroHeight,
    "the hero block should stay within a phone's budget (this guards the badge staying narrow and catches a gross aggregate regression — it does not and structurally cannot guard the <h1>'s font size, see the comment above)",
  ).toBeLessThanOrEqual(460);
});

test("every destination card is a full-size tap target that navigates", async ({ page }) => {
  const destinations = [
    { name: /^Nous rejoindre/, path: "/commencement" },
    { name: /^Les canetons/, path: "/canetons" },
    { name: /^Événements/, path: "/planning_repet" },
    { name: /^Contact/, path: "/comite_teamdirection" },
  ];

  for (const destination of destinations) {
    await page.goto("/");
    const list = page.getByRole("list", { name: "Découvrir les Canetons" });
    const link = list.getByRole("link", { name: destination.name });

    // 44px is the floor for every interactive control here. A card is far
    // bigger than that, so this fails only if the card stops BEING the link —
    // a "read more" anchor inside it would measure about 20px.
    const box = (await link.boundingBox())!;
    expect(box.height, "the whole card should be the tap target").toBeGreaterThanOrEqual(44);

    // All four, not one representative: a dead route renders a perfect card and
    // lands on the 404 view, and three of this site's pages ARE hidden routes
    // that would do exactly that.
    await link.click();
    await expect(page).toHaveURL(new RegExp(`${destination.path}$`));
  }
});

test("the next event block shows a real event and leads to the planning", async ({ page }) => {
  await page.goto("/");

  const section = page.getByRole("list", { name: "Prochain événement" });
  await expect(section).toBeVisible();

  // The fixture's first upcoming event. Its date is an offset from today, so
  // the title is the stable thing to assert on here — the unit test is what
  // pins the date, where the offset can be recomputed. A straight apostrophe:
  // that is what the fixture holds, and EventCard renders the title verbatim
  // in a <p>, not as a heading.
  await expect(section.getByText("Concert d'automne")).toBeVisible();

  await section.getByRole("link", { name: "Voir tous les événements" }).click();
  await expect(page).toHaveURL(/planning_repet$/);
  await expect(page.getByRole("heading", { level: 1, name: "Événements" })).toBeVisible();
});
