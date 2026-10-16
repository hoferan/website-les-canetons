import { expect, type Page, test } from "@playwright/test";

/**
 * The direction's side of an event: writing it, publishing it, and chasing the
 * people who have not answered.
 *
 * Against the MOCKED backend on its own port; see playwright.config.ts. Every
 * test here writes and then reads what it wrote, and the mocked backend keeps
 * its events and answers in the page's module state, so after the first write
 * each test moves by in-app links only. A `page.goto` there would reload the
 * module and read the seed again.
 */
async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

function navLink(page: Page, name: string) {
  return page
    .getByRole("navigation", { name: "Navigation principale" })
    .getByRole("link", { name })
    .locator("visible=true");
}

/** A date `days` from today as a date input takes it, in the browser's own zone. */
async function dateFromToday(page: Page, days: number): Promise<string> {
  return page.evaluate((offset) => {
    const day = new Date();
    day.setDate(day.getDate() + offset);
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
  }, days);
}

test("the direction writes a draft, edits it, publishes it, and the public agenda lists it", async ({
  page,
}) => {
  const title = "Concert de printemps";
  await logIn(page, "demo.direction");
  await page.goto("/events");

  await page.getByRole("button", { name: "Ajouter au planning" }).click();
  await page.getByRole("menuitem", { name: "Ajouter un événement" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Nouvel événement");

  // A draft may be incomplete: a title and a date are enough to save one.
  await page.getByLabel("Titre").fill(title);
  await page.getByLabel("Date de début").fill(await dateFromToday(page, 50));
  await page.getByLabel("Heure de début").fill("19:00");
  await page.getByLabel("Heure de fin").fill("21:00");
  await page.getByRole("button", { name: "Enregistrer le brouillon" }).click();

  await expect(page).toHaveURL(/\/events$/);
  const drafts = page.getByRole("region", { name: "Brouillons" });
  await expect(drafts.getByTestId("event-title").filter({ hasText: title })).toBeVisible();

  // Nobody outside the direction sees a draft, so the agenda does not list it.
  // Anchored on an event the seed does make public, so the absence below is
  // checked against a list that has finished loading.
  await navLink(page, "Où nous voir").click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByText("Vendanges Cheyres").first()).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
  await navLink(page, "Événements").click();

  // EDITED FROM ITS CARD, where a draft carries Publier inline and the rest in
  // the row menu.
  await drafts.getByRole("button", { name: `Autres actions pour ${title}` }).click();
  await page.getByRole("menuitem", { name: /^Modifier/ }).click();
  await expect(page).toHaveURL(/\/events\/\d+\/edit$/);
  await expect(page.getByLabel("Titre")).toHaveValue(title);

  await page.getByLabel("Lieu").fill("Salle paroissiale, Fribourg");
  await page.getByLabel("Visible sur le site public").check();
  await page.getByRole("button", { name: "Publier" }).click();

  await expect(page).toHaveURL(/\/events$/);
  const card = page.getByTestId("event-card").filter({ hasText: title });
  await expect(card).toBeVisible();
  await expect(card.getByTestId("draft-badge")).toHaveCount(0);
  await expect(card.getByTestId("event-location")).toHaveText("Salle paroissiale, Fribourg");
  await expect(drafts.getByText(title)).toHaveCount(0);

  // Published AND public: the one combination that reaches the band's public.
  // The URL and the seeded public event first: until the route has changed,
  // the planning card is still on screen with the very same title, and a bare
  // text match passed on it with `isPublic` never sent.
  await navLink(page, "Où nous voir").click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.getByText("Vendanges Cheyres").first()).toBeVisible();
  await expect(page.getByText(title)).toBeVisible();
});

/**
 * THE PHONE CALL TO THE COMMITTEE. Bastien has not answered the next
 * rehearsal; somebody rings, and the direction enters their "oui" from the
 * chase list. The counts move, Bastien leaves the silent list, and their line
 * says the committee entered it.
 */
test("the chase list records an answer on somebody's behalf and the counts follow", async ({
  page,
}) => {
  await logIn(page, "demo.direction");
  await page.goto("/events");

  // The first published rehearsal is event 1, the next one, which is the
  // event the seed's answers are about.
  const card = page
    .getByTestId("event-card")
    .filter({ has: page.getByRole("link", { name: "Qui vient à Répétition" }) })
    .first();
  await expect(card.getByLabel("3 réponses sur 4")).toBeVisible();
  await card.getByRole("link", { name: "Qui vient à Répétition" }).click();

  await expect(page).toHaveURL(/\/events\/1\/attendance$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Qui vient ?");
  await expect(page.getByTestId("chase-counts")).toHaveText("2 oui · 1 non · 1 sans réponse");

  const silent = page.getByTestId("chase-silent");
  await expect(silent.getByText("Bastien Both")).toBeVisible();
  await silent.getByRole("button", { name: "Bastien Both vient" }).click();

  await expect(page.getByTestId("chase-counts")).toHaveText("3 oui · 1 non · 0 sans réponse");
  await expect(page.getByTestId("chase-silent")).toHaveCount(0);

  const line = page.getByTestId("chase-cards").getByRole("listitem").filter({
    hasText: "Bastien Both — oui",
  });
  await expect(line).toBeVisible();
  await expect(line).toContainText("Saisie par le comité.");

  // The planning's own summary for that event counts it as well.
  await page.getByRole("link", { name: "Retour au planning" }).click();
  await expect(card.getByLabel("4 réponses sur 4")).toBeVisible();
});

/**
 * demo.both ANSWERS AND MANAGES, the account an either/or model cannot
 * express. On the chase list their own row carries no buttons: the on-behalf
 * endpoint refuses its own caller, and their answer belongs on the planning,
 * where taking back a "oui" costs a reason.
 */
test("somebody who both plays and manages is sent to the planning for their own answer", async ({
  page,
}) => {
  await logIn(page, "demo.both");

  // The mocked demo.both must change their password first; nothing shorter
  // reaches both permissions at once. The session keeps the change across a
  // reload, so a page.goto after it is safe.
  await page.getByLabel("Mot de passe actuel").fill("demo");
  await page.getByLabel("Nouveau mot de passe", { exact: true }).fill("demo1234");
  await page.getByLabel("Confirmer le nouveau mot de passe").fill("demo1234");
  await page.getByRole("button", { name: "Changer le mot de passe" }).click();
  await expect(page.getByText("Votre mot de passe a été changé.")).toBeVisible();

  await page.goto("/events/1/attendance");
  const ownRow = page.getByTestId("chase-silent").getByRole("listitem").filter({
    hasText: "Bastien Both",
  });
  await expect(ownRow).toContainText("Répondez depuis le planning.");
  await expect(ownRow.getByRole("button")).toHaveCount(0);

  // The other rows keep their Corriger, so the permission is there: only the
  // caller's own row is held back.
  await expect(
    page.getByRole("button", { name: "Corriger la réponse de Perrine Player" }),
  ).toBeVisible();
});
