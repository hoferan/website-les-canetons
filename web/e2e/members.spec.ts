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

  for (const path of ["/events", "/members", "/account"]) {
    await page.goto(path);
    // Anchored on the card rather than on load, so the measurement cannot run
    // against a page that has not painted its rows yet.
    if (path === "/events") {
      await expect(page.getByTestId("event-card").first()).toBeVisible();
    }
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow, `${path} scrolls sideways at 390px`).toBeLessThanOrEqual(0);
  }
});
