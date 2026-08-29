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
  await expect(page.getByRole("heading", { name: /Planning des prestations/ })).toBeVisible();
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
 * Logs in the way web/src/api/http.ts does — prime the CSRF cookie, replay the
 * token — because there is no login PAGE yet: /authentification_inscription is
 * still a placeholder. When it is ported this helper is replaced by filling
 * that form, and these tests should not need to change otherwise.
 *
 * It waits for the page's own data first. `page.goto` resolves on `load`, but
 * main.tsx starts MSW behind a top-level await, so a request fired the instant
 * goto returns can beat the service worker and go out to Vite's proxy — where
 * it reaches whatever is on :8090, or nothing, and comes back 500. Rendered
 * rows prove the worker is answering.
 */
async function login(page: import("@playwright/test").Page, username: string) {
  await events(page).first().waitFor();
  const status = await page.evaluate(async (user) => {
    await fetch("/sanctum/csrf-cookie", { credentials: "include" });
    const token = document.cookie
      .split("; ")
      .find((cookie) => cookie.startsWith("XSRF-TOKEN="))
      ?.split("=")[1];
    const response = await fetch("/api/login", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-XSRF-TOKEN": decodeURIComponent(token ?? ""),
      },
      body: JSON.stringify({ username: user, password: "demo" }),
    });
    return response.status;
  }, username);
  expect(status).toBe(200);
  await page.reload();
}

test("an admin can add an event", async ({ page }) => {
  await page.goto("/planning_repet");
  await login(page, "demo.admin");

  await page.getByLabel("Date :").fill("2026-12-05");
  await page.getByLabel("Titre :").fill("Cortège");
  await page.getByLabel("Heure de début :").fill("14:00");
  await page.getByLabel("Heure de fin :").fill("17:00");
  await page.getByLabel("Lieu :").fill("Vieille-Ville");
  await page.getByRole("button", { name: "Ajouter" }).click();

  await expect(events(page)).toHaveCount(4);
  await expect(events(page).last()).toContainText("Cortège");
});

test("opening the edit form never paints it empty", async ({ page }) => {
  await page.goto("/planning_repet");
  await login(page, "demo.admin");
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
