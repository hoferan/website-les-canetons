import { expect, test } from "@playwright/test";

/**
 * The members' side, in a real browser — for the two things jsdom cannot see.
 *
 * Both were found by André's manual pass over R2 on 2026-09-14, and both had
 * been shipped and green since R1a/R1b: there was no way to log out at all, and
 * the roster form carried a field with no control. A component suite was happy
 * with each, because a control that is never rendered fails no assertion
 * nobody wrote.
 *
 * Against the MOCKED backend on its own port; see playwright.config.ts.
 */
async function logIn(page: import("@playwright/test").Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();
}

/**
 * THE LANDING, which is the half Layout.test.tsx cannot assert: logging out is
 * a full page load, jsdom performs none, and `window.location` is
 * non-configurable so no spy can stand in for it.
 */
test("logging out ends the session and lands on the public front page", async ({ page }) => {
  await logIn(page, "demo.direction");

  // From /members, which is where somebody actually finishes and logs out —
  // and the page whose route guard defeated three in-app versions of this.
  await page.goto("/members");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Membres");

  await page.getByRole("button", { name: "Déconnexion" }).locator("visible=true").click();

  // `/`, not `/login`: logging out is finishing, not starting again.
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("depuis 2002");

  // And the session is genuinely gone rather than merely navigated away from.
  await expect(page.getByRole("link", { name: "Connexion" }).first()).toBeVisible();
  await page.goto("/members");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Connexion");
});

test("logging out is reachable from inside the forced-password gate", async ({ page }) => {
  await logIn(page, "demo.mustchange");

  // That member is held on /account and can reach the chrome and nothing else,
  // which is the whole reason the control lives in the nav rather than on a
  // page of its own.
  await page.goto("/members");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Mon compte");

  await page.getByRole("button", { name: "Déconnexion" }).locator("visible=true").click();
  await expect(page.getByRole("heading", { level: 1 })).toContainText("depuis 2002");
});

/**
 * THE FIELD THAT HAD NO CONTROL. `instructor_of_section_id` shipped in R1a,
 * MemberForm carried it in its draft, and Members.tsx sent it on every write —
 * with nothing on screen ever setting it, so it could only be the null it
 * started as. R2's band page is the first thing that reads it.
 */
test("a member can be made the instructor of a register, and it reaches the public page", async ({
  page,
}) => {
  await logIn(page, "demo.direction");

  await page.goto("/members");
  await page.getByRole("button", { name: "Modifier Perrine Player" }).click();

  const instructorOf = page.getByLabel("Moniteur du pupitre");
  await expect(instructorOf).toBeVisible();
  // Distinct from "Pupitre" above it: Perrine PLAYS in Cloches and will now
  // TEACH the Lyre. Two columns, both true, and the band page lists her under
  // both.
  await instructorOf.selectOption({ label: "Lyre" });
  await page.getByRole("button", { name: "Enregistrer" }).click();

  // WAIT FOR THE SAVE TO LAND BEFORE NAVIGATING. The form closes only on a
  // successful write, so this button reappearing is the signal; without it the
  // nav click below races the PATCH, the band page reads the pre-edit roster
  // out of the mocked backend's module state, and the failure reads as "the
  // instructor field does not work". Latent since this test was written and it
  // surfaced on CI, where two workers share one machine.
  await expect(page.getByRole("button", { name: "Ajouter une personne" })).toBeVisible();

  // NAVIGATED IN THE SPA, NOT `page.goto`. The mocked backend keeps its roster
  // in module state, so a full page load resets it and the edit made two lines
  // ago is gone — only the session survives, because that one lives in
  // sessionStorage. A reload here made this test read an unedited roster and
  // fail as though the save had not worked.
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Les canetons" })
    .locator("visible=true")
    .click();

  const lyre = page.getByRole("article", { name: "Lyre" });
  await expect(lyre).toContainText("Moniteurs");
  await expect(lyre).toContainText("Perrine");
  await expect(page.getByRole("article", { name: "Cloches" })).toContainText("Perrine");
});

/**
 * THE MIRROR OF public.spec.ts's overflow guard, for the side of the site that
 * had none — which is how #89 shipped. `/events` at 390px measured
 * `scrollWidth` 613 against `clientWidth` 390 for anybody holding
 * `events.manage`: the card's action row carried `shrink-0`, which pins a flex
 * item at its unwrapped width, so its own `flex-wrap` could never fire.
 *
 * AS demo.direction, because the overflow needs the widest row there is — the
 * five buttons the souper gets, which wants `events.manage`,
 * `attendance.view_all` and `registrations.view` at once. A player sees no
 * actions at all and would have measured clean over the bug.
 *
 * MEASURED, not eyeballed. A row that escapes its card still looks like
 * buttons.
 */
test("the members' pages carry no horizontal overflow on a phone", async ({ page }) => {
  // LOGGED IN FIRST, THEN NARROWED. The nav collapses at 390px, so the
  // helper's landing assertion reads a link that is deliberately hidden there.
  await logIn(page, "demo.direction");
  await page.setViewportSize({ width: 390, height: 844 });

  // "/events/7/registrations", NOT A CLICK-THROUGH: 7 is the souper's fixed
  // id in the mocked backend (handlers.ts's initialRegistrations/the one
  // event with takesRegistrations), and it is the only event with bookings
  // to measure. Whole-branch review I1: the design doc measured the roster
  // and the planning at 390px and never this screen, and BookingActions'
  // two controls went from `size="sm"` to the default when this screen moved
  // to the shared RowActions component — `RowAction` carries no size field —
  // which is exactly the axis #118 exists to fix.
  for (const path of ["/events", "/members", "/account", "/events/7/registrations"]) {
    await page.goto(path);
    // Anchored on the card rather than on load, so the measurement cannot run
    // against a page that has not painted its rows yet.
    if (path === "/events") {
      await expect(page.getByTestId("event-card").first()).toBeVisible();
    }
    if (path === "/events/7/registrations") {
      await expect(page.getByTestId("guest-cards")).toBeVisible();
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways at 390px`).toBeLessThanOrEqual(0);

    // THE POINT OF #118, measured rather than eyeballed. The souper is the
    // widest row there is: five actions for demo.direction. Before this
    // change it wrapped to three lines and 148px.
    //
    // CORRECTED FROM THE BRIEF'S LOCATOR: `RowActions` renders its own
    // `flex flex-wrap gap-tight` wrapper around the inline control(s) and the
    // "..." trigger, and `EventCard` wraps THAT again in a `div` carrying the
    // identical class, so a plain `div.flex.flex-wrap.gap-tight` selector
    // matches both, nested. `:has(> button[...])` only matches a `div` whose
    // DIRECT child is the trigger button — that is `RowActions`'s own div,
    // never `EventCard`'s outer one, whose direct child is a div, not a
    // button — so the `>` combinator already disambiguates them. Confirmed
    // against the rendered page before trusting it here: `count` is 1, not 2.
    if (path === "/events") {
      const row = page
        .locator('[data-testid="event-card"]', { hasText: "Souper" })
        .locator("css=div:has(> button[aria-label^='Autres actions'])");
      const box = await row.boundingBox();
      expect(box?.height, "the souper's action row is more than one line").toBeLessThanOrEqual(48);

      // THE POINT OF #182, and the only thing standing between it and a silent
      // regression. The saving is one adjacency — a 103px trigger beside a
      // 170px heading — and if it ever stops holding, the row simply wraps
      // back and no test, type error or lint says a word.
      //
      // MEASURED AS THE HEADING'S OWN ROW, not as the trigger: a wrapped
      // trigger is still 44px tall, and it is the ROW that grows to 104px.
      const headingRow = page.locator("h1").locator("..");
      const headingBox = await headingRow.boundingBox();
      expect(
        headingBox?.height,
        "the heading and the Ajouter trigger no longer share one line",
      ).toBeLessThanOrEqual(48);

      // AND THE RESULT OF IT, which is the number #182 is closed on. 287 when
      // this was written; the bound leaves room for a font or a heading change
      // without pinning a pixel.
      const firstCardTop = await page
        .getByTestId("event-card")
        .first()
        .evaluate((el) => Math.round(el.getBoundingClientRect().top + window.scrollY));
      expect(firstCardTop, "the control block above the first card has grown").toBeLessThan(300);

      // THE 44px FLOOR, MEASURED, which is the only place it can be. The jsdom
      // suite can see that `min-h-touch` is in a className and nothing more —
      // not a misspelt token, not a missing --spacing-touch, not a later class
      // winning the cascade. Both halves of the new switch are controls a thumb
      // has to hit on the phone this whole issue is about.
      for (const name of ["Planning", "Passés"]) {
        const segmentBox = await page.getByRole("radio", { name }).boundingBox();
        expect(
          segmentBox?.height,
          `the "${name}" segment is under the 44px floor`,
        ).toBeGreaterThanOrEqual(44);
      }

      // THE ARROW KEY SELECTS, which is the entire reason RadioGroup was chosen
      // over ToggleGroup — that one emits role="radio" and then never selects on
      // an arrow at all. It cannot be asserted in jsdom, because Radix selects
      // by calling click() from the item's onFocus while an arrow is held and
      // that needs real focus events. So the reason for the primitive is
      // guarded here or nowhere.
      //
      // { delay: 50 }, FOUND HERE, NOT IN THE BRIEF: Radix's own arrow-key
      // handling defers the focus move to `setTimeout(focusFirst)`
      // (@radix-ui/react-roving-focus), so the click-on-focus in
      // @radix-ui/react-radio-group only fires while its `isArrowKeyPressedRef`
      // is still true — a flag a document `keydown`/`keyup` pair sets and
      // clears. A zero-delay `press()` dispatches keydown and keyup back to
      // back, and the keyup's synchronous reset can beat the deferred
      // `setTimeout`, so the same command that read as PASS in the brief's own
      // Step 2 run failed here on the first try: focus moved to "Passés" but
      // `aria-checked` never flipped. A real key press is never that fast;
      // `delay: 50` is what a human's keydown-to-keyup actually looks like, and
      // it made the result reproducible across repeated runs.
      await page.getByRole("radio", { name: "Planning" }).focus();
      await page.keyboard.press("ArrowRight", { delay: 50 });
      await expect(page.getByRole("radio", { name: "Passés" })).toBeChecked();
      // And the list below genuinely changed, not just the control.
      await expect(
        page.getByRole("heading", { level: 2, name: "Événements passés" }),
      ).toBeVisible();

      // Back, so the rest of the loop measures the upcoming view it expects.
      await page.getByRole("radio", { name: "Planning" }).click();
    }

    // I1. BookingActions has exactly two actions (Corriger, Annuler
    // l'inscription), so RowActions' own rule — a menu needs two items left
    // over once one goes inline — never has two to work with: both render
    // inline and no "..." trigger is drawn. `div.flex.flex-wrap.gap-tight` is
    // therefore RowActions' own wrapper directly, unambiguous here because
    // this screen has no EventCard-style outer duplicate of that class.
    if (path === "/events/7/registrations") {
      const row = page
        .getByTestId("guest-cards")
        .locator("li")
        .first()
        .locator("css=div.flex.flex-wrap.gap-tight");
      const box = await row.boundingBox();
      expect(box?.height, "the guest list's booking row is more than one line").toBeLessThanOrEqual(
        48,
      );
    }
  }
});

/**
 * TOUCH, WHICH `computer.click` NEVER EXERCISES. Spec §6, Review Focus 5: a
 * `tap` on a menu item must not also register on whatever the menu closing
 * reveals underneath it — the classic "tap-through" bug a mouse click cannot
 * catch because a mouse has no separate touchstart/touchend to race.
 *
 * I1/I2 WHOLE-BRANCH REVIEW: the URL assertion this test used to end on
 * proves only that the tap navigated — it catches a tap-through onto
 * something that navigates, and nothing else. `/events` also carries
 * `AttendanceControls`, and Radix selects on `pointerup` with no overlay to
 * catch a stray one under `modal={false}`, so the sharper risk is a tap that
 * lands on "Oui, je viens" / "Non" underneath the closing menu and silently
 * records a presence answer nobody gave. That is what this test now proves
 * did not happen, by reading the event's own attendance state back after
 * the tap rather than trusting the URL alone.
 */
test("selecting a menu item on a touch phone does not also hit what is under it", async ({
  browser,
}) => {
  // hasTouch/isMobile set at context creation (Playwright cannot change
  // either after the fact), but the VIEWPORT starts wide and is narrowed only
  // after logIn's own assertion runs — the same "logged in first, then
  // narrowed" fix the overflow test above already documents. Creating the
  // context at 390x844 straight away, as the brief originally had it, fails
  // for the identical reason: below `md` the nav collapses behind the
  // hamburger (Layout.tsx's `hidden md:flex`), so logIn's
  // `getByRole("link", { name: username })` check never finds a visible link
  // and every run of this test times out on login, before it ever reaches the
  // tap it exists to test. Confirmed by running it exactly as the brief wrote
  // it first.
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await ctx.newPage();

  // demo.both, NOT demo.direction. `AttendanceControls` returns `null` for
  // anybody with `isPlayer: false` — see its own docblock — and
  // demo.direction is exactly that member: "organises, does not play"
  // (CLAUDE.md). Under that account the region under the menu never carries
  // an attendance control at all, so no assertion about one can mean
  // anything. demo.both is the one seeded account that both manages events
  // (so its cards carry the overflow menu) and answers for itself (so its
  // own card also carries the "Oui, je viens" / "Non" pair the stray tap
  // could hit).
  await logIn(page, "demo.both");

  // demo.both carries `mustChangePassword: true` in the mocked backend — the
  // same fixture the forced-password test above exercises — so the gate
  // sits between login and /events for this account and nothing shorter
  // reaches both permissions this test needs. Cleared rather than avoided:
  // no seeded account is both a manager and a player without it.
  await page.getByLabel("Mot de passe actuel").fill("demo");
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("demo1234");
  await page.getByLabel("Confirmer le nouveau mot de passe").fill("demo1234");
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(page.getByText("Votre mot de passe a été changé.")).toBeVisible();

  // AN IN-APP LINK, NOT `page.goto`. The mocked backend keeps every bit of
  // its state — including the password change just made and the unanswered
  // attendance this test is about to rely on — in the page's own module
  // instance, and a full navigation reloads that module from scratch,
  // silently resetting both. See the instructor test above for the same
  // trap on the roster side.
  await page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name: "Événements" })
    .locator("visible=true")
    .click();
  await expect(page.getByTestId("event-card").first()).toBeVisible();

  await page.setViewportSize({ width: 390, height: 844 });

  const card = page.getByTestId("event-card").first();
  const title = (await card.getByTestId("event-title").textContent()) ?? "";
  // `attendance.notComingToAria`, the accessible name RowActions never
  // touches: it carries the event's own title, so this also pins the query
  // to THIS card rather than to "Non" on whichever renders first.
  const notComing = card.getByRole("button", { name: `Je ne viens pas à ${title}` });

  // UNANSWERED BEFORE THE TAP, so the check after the tap has something to
  // falsify. demo.both's planning starts with every event owed a response
  // (the "À répondre" block lists all six), so the first card qualifies
  // without picking one by hand.
  await expect(notComing).toHaveAttribute("aria-pressed", "false");

  await card.getByRole("button", { name: /^Autres actions pour/ }).tap();
  await page.getByRole("menuitem", { name: /^Modifier/ }).tap();

  // The edit route, still checked: a tap that missed the menu item entirely
  // and hit something un-navigable would otherwise read as a pass below.
  await expect(page).toHaveURL(/\/events\/\d+\/edit$/);

  // BROWSER BACK, NOT `page.goto`, for the reason given above — this is a
  // same-origin SPA history entry, so react-router handles the `popstate`
  // without a reload and the mocked backend's state survives the round trip.
  await page.goBack();
  await expect(page.getByTestId("event-card").first()).toBeVisible();

  // THE POINT OF THIS TEST. Still unanswered: the tap that opened the menu
  // and selected "Modifier" recorded nothing on the card underneath it.
  // `answered-in-place` is the second half of that: it renders only inside
  // "À répondre" (`inOwed && answer`, AttendanceControls.tsx) — where this
  // card sits — so its continued absence is a second, independent witness
  // to nothing having been recorded.
  await expect(notComing).toHaveAttribute("aria-pressed", "false");
  await expect(card.getByTestId("answered-in-place")).toHaveCount(0);

  // THE PAGE-LEVEL MENU, the second trigger this test exists for: it sits
  // directly above the first card's own controls, so a tap that closes it
  // must not also land on what is underneath.
  await page.getByRole("button", { name: "Ajouter au planning" }).tap();
  await page.getByRole("menuitem", { name: "Ajouter une série" }).tap();
  await expect(page).toHaveURL(/\/events\/new\/series$/);

  await ctx.close();
});
