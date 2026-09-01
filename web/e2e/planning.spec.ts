import { expect, test } from "@playwright/test";

/**
 * The planning page in a real browser, against the mocked backend.
 *
 * The list is addressed by its accessible name, never by an unscoped
 * `getByRole("listitem")`: the layout's navigation is a list too, so an
 * unscoped query counts every nav item and reports seventeen rows for three
 * events. That mistake has already been made once in the unit tests.
 */
const events = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Événements" }).getByRole("listitem");

test("the planning page lists events", async ({ page }) => {
  await page.goto("/planning_repet");
  await expect(page.getByRole("heading", { name: "Événements" })).toBeVisible();
  await expect(events(page)).toHaveCount(3);
  await expect(events(page).first()).toContainText("Concert d'automne");
});

test("an anonymous visitor sees no admin form", async ({ page }) => {
  await page.goto("/planning_repet");
  await expect(events(page).first()).toBeVisible();
  await expect(page.getByLabel("Date :")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Supprimer/ })).toHaveCount(0);
});

test("an unknown URL renders the SPA's 404 view", async ({ page }) => {
  await page.goto("/pas-une-page");
  await expect(page.getByRole("heading", { name: "Page introuvable" })).toBeVisible();
});

/**
 * Logs in through the real form, which is the point: this used to POST to
 * /api/login from page.evaluate because /authentification_inscription was a
 * placeholder.
 *
 * It waits for the navigation's own username to appear rather than for the
 * request to return. The nav item is proof the SESSION is live, not merely that
 * the endpoint answered — which is exactly the failure mode of forgetting to
 * invalidate the session query.
 */
async function login(page: import("@playwright/test").Page, username: string) {
  await page.goto("/authentification_inscription");
  await page.getByLabel("Identifiant :").fill(username);
  await page.getByLabel("Mot de passe :").fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("link", { name: username })).toBeVisible();
}

/**
 * A date N days from today, as "YYYY-MM-DD".
 *
 * GET /api/events filters to upcoming events, so an event created with a fixed
 * date would stop appearing in the list on the day it passed and the add test
 * would fail for a reason that looks nothing like its cause. Spelled out here
 * rather than imported from web/src/mocks: this spec drives a browser and does
 * not share a module graph with the app.
 */
function upcoming(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

test("an admin can add an event", async ({ page }) => {
  await login(page, "demo.admin");
  await page.goto("/planning_repet");

  await page.getByLabel("Date :").fill(upcoming(95));
  await page.getByLabel("Titre :").fill("Cortège");
  await page.getByLabel("Heure de début :").fill("14:00");
  await page.getByLabel("Heure de fin :").fill("17:00");
  await page.getByLabel("Lieu :").fill("Vieille-Ville");
  await page.getByRole("button", { name: "Ajouter" }).click();

  await expect(events(page)).toHaveCount(4);
  await expect(events(page).last()).toContainText("Cortège");
});

test("opening the edit form never paints it empty", async ({ page }) => {
  await login(page, "demo.admin");
  await page.goto("/planning_repet");
  await page.getByLabel("Date :").waitFor();

  // Samples every animation frame for ~1.5s after the click and keeps each
  // DISTINCT state, so the assertion is about what was painted rather than
  // about when we happened to look.
  //
  // The state this forbids — the submit button already reading "Modifier" over
  // an empty title — is what you get when the values are copied out of the
  // `editing` prop by a useEffect: React commits the render that switches the
  // mode, paints it, and only then runs the passive effect that fills the
  // inputs. The admin sees an empty form flash. Deriving the state during
  // render instead (a `key` on the caller) closes the window entirely, because
  // there is no commit in which the mode and the values disagree.
  //
  // It has to be an end-to-end test. Testing Library wraps every interaction in
  // act(), which flushes effects before any assertion can run, so in jsdom the
  // window does not exist — which is exactly how this survived a green unit
  // suite in the first place.
  const painted = await page.evaluate(
    () =>
      new Promise<{ submit: string | null; title: string | null }[]>((resolve) => {
        const seen: { submit: string | null; title: string | null }[] = [];
        const record = () => {
          const state = {
            submit: document.querySelector("form button[type=submit]")?.textContent ?? null,
            title: document.querySelector<HTMLInputElement>("#event-title")?.value ?? null,
          };
          const last = seen.at(-1);
          if (!last || last.submit !== state.submit || last.title !== state.title) {
            seen.push(state);
          }
        };

        record();
        document
          .querySelector<HTMLButtonElement>('button[aria-label="Modifier Concert d\'automne"]')
          ?.click();

        let frames = 0;
        const tick = () => {
          record();
          if (++frames < 90) requestAnimationFrame(tick);
          else resolve(seen);
        };
        requestAnimationFrame(tick);
      }),
  );

  expect(painted.at(-1)).toEqual({ submit: "Modifier", title: "Concert d'automne" });
  expect(painted).not.toContainEqual({ submit: "Modifier", title: "" });
});
