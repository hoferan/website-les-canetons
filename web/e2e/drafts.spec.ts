import { expect, type Page, test } from "@playwright/test";

/**
 * Who sees a draft, in a real browser.
 *
 * Against the MOCKED backend, on its own port; see playwright.config.ts. That
 * makes this a proof of what the screens do with the contract, and NOT proof
 * of the contract itself: the filter that actually keeps a draft from the
 * band lives in EventController::index() and the event.published middleware,
 * and EventDraftVisibilityTest is what pins those. Both were mutation-tested
 * by removing the filter and watching the matching test fail.
 *
 * The seed has two drafts: "Concert d'automne" (dated, marked public on
 * purpose) and "Sortie de fin de saison" (nothing but a title).
 */
async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

/** A status from the mocked API, asked the way the app asks it: from the page. */
async function statusOf(page: Page, method: string, url: string, body?: unknown) {
  return page.evaluate(
    async ([verb, target, payload]) => {
      const response = await fetch(target as string, {
        method: verb as string,
        headers: { "Content-Type": "application/json" },
        body: payload === undefined ? undefined : JSON.stringify(payload),
      });
      return response.status;
    },
    [method, url, body] as const,
  );
}

test("the committee sees both drafts in their own group, the dateless one first", async ({
  page,
}) => {
  await logIn(page, "demo.direction");
  await page.goto("/events");

  const drafts = page.getByRole("region", { name: "Brouillons" });
  await expect(drafts).toBeVisible();

  const titles = drafts.getByTestId("event-title");
  await expect(titles).toHaveText(["Sortie de fin de saison", "Concert d'automne"]);

  // A missing date is said, not left blank.
  await expect(drafts.getByTestId("event-when").first()).toHaveText("Date à fixer");
  await expect(drafts.getByTestId("draft-badge")).toHaveCount(2);
});

test("a player sees no drafts group and cannot reach a draft by id or answer it", async ({
  page,
}) => {
  await logIn(page, "demo.player");
  await page.goto("/events");

  await expect(page.getByTestId("event-card").first()).toBeVisible();
  await expect(page.getByRole("region", { name: "Brouillons" })).toHaveCount(0);
  await expect(page.getByText("Concert d'automne")).toHaveCount(0);
  await expect(page.getByText("Sortie de fin de saison")).toHaveCount(0);

  // The event route by id, and an attendance write against it: both are the
  // same 404 an id nothing matches would get.
  expect(await statusOf(page, "GET", "/api/v1/events/8")).toBe(404);
  expect(await statusOf(page, "PUT", "/api/v1/events/8/attendance", { status: "yes" })).toBe(404);
});

test("the public agenda never lists a draft, even one marked public", async ({ page }) => {
  await page.goto("/agenda");

  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page.getByText("Concert d'automne")).toHaveCount(0);
});

test("a draft can be published from its card and then leaves the drafts group", async ({
  page,
}) => {
  await logIn(page, "demo.direction");
  await page.goto("/events");

  await page.getByRole("button", { name: "Publier Concert d'automne" }).click();

  const drafts = page.getByRole("region", { name: "Brouillons" });
  await expect(drafts.getByTestId("event-title")).toHaveText(["Sortie de fin de saison"]);
  await expect(
    page.getByTestId("event-title").filter({ hasText: "Concert d'automne" }),
  ).toBeVisible();
});
