import { expect, type Locator, type Page, test } from "@playwright/test";

/**
 * A member answering for events from the planning, in a real browser.
 *
 * Against the MOCKED backend on its own port; see playwright.config.ts. As
 * demo.player, who holds `attendance.respond` and nothing else. In the seed
 * that member has one answer, a settled "oui" to the next rehearsal, and none
 * to the "Weekend musical" or the "Vendanges Cheyres", which is why those two
 * are the events these tests answer: both titles are unique on the planning,
 * where four events are called "Répétition".
 */
async function logIn(page: Page, username: string) {
  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("demo");
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page.getByRole("button", { name: `Compte de ${username}` })).toBeVisible();
}

/**
 * The caller's answer to one event as the mocked backend holds it, read from
 * the page so it goes through the same worker the app's own requests do.
 *
 * Asked of the API rather than of the card on purpose: the card is patched
 * before the request leaves, so a write the server refused would still look
 * answered there until the rollback landed.
 */
async function storedAnswer(page: Page, title: string) {
  return page.evaluate(async (wanted) => {
    const response = await fetch("/api/v1/events");
    const body = (await response.json()) as {
      data: { title: string; myAttendance: { status: string; note: string | null } | null }[];
    };
    const event = body.data.find((candidate) => candidate.title === wanted);
    return event ? event.myAttendance : "missing";
  }, title);
}

function toast(page: Page, text: string) {
  return page.locator("[data-sonner-toast]").filter({ hasText: text });
}

/** The undo a toast offers, found the same way whether or not it is there. */
function undoIn(toastLocator: Locator) {
  return toastLocator.locator("button[data-action]", { hasText: "Annuler" });
}

test("a member answers yes, then takes it back with the reason the committee will read", async ({
  page,
}) => {
  await logIn(page, "demo.player");
  await page.goto("/events");

  const card = page.getByTestId("event-card").filter({ hasText: "Weekend musical" });
  const coming = card.getByRole("button", { name: "Je viens à Weekend musical" });
  const notComing = card.getByRole("button", { name: "Je ne viens pas à Weekend musical" });

  await expect(coming).toHaveAttribute("aria-pressed", "false");
  await expect(notComing).toHaveAttribute("aria-pressed", "false");

  await coming.click();
  await expect(coming).toHaveAttribute("aria-pressed", "true");
  await expect(toast(page, "Vous venez — Weekend musical.")).toBeVisible();
  await expect.poll(() => storedAnswer(page, "Weekend musical")).toMatchObject({ status: "yes" });

  // Taking back a "oui" costs a reason (ADR 0018), so "Non" opens a dialog.
  await notComing.click();
  const dialog = page.getByRole("alertdialog", { name: /Weekend musical/ });
  await expect(dialog).toBeVisible();

  // Without one the confirm button is held, and a tap on it changes nothing.
  // Dispatched rather than clicked: Playwright refuses to click an
  // aria-disabled control, and what is under test is the handler's own early
  // return, since aria-disabled alone stops no click (components/ui/button.tsx).
  const confirm = dialog.getByRole("button", { name: "Je ne viens pas" });
  await expect(confirm).toHaveAttribute("aria-disabled", "true");
  await confirm.dispatchEvent("click");
  await expect(dialog).toBeVisible();
  await expect.poll(() => storedAnswer(page, "Weekend musical")).toMatchObject({ status: "yes" });

  await dialog.getByLabel("Raison").fill("Malade");
  await expect(confirm).toHaveAttribute("aria-disabled", "false");
  await confirm.click();
  await expect(dialog).toBeHidden();

  await expect(notComing).toHaveAttribute("aria-pressed", "true");
  await expect(coming).toHaveAttribute("aria-pressed", "false");
  // The member sees what the committee is reading.
  await expect(card.getByTestId("attendance-note")).toHaveText("« Malade »");
  await expect
    .poll(() => storedAnswer(page, "Weekend musical"))
    .toEqual(expect.objectContaining({ status: "no", note: "Malade" }));

  // A CHANGE offers no undo: the only thing behind it is a DELETE, which would
  // throw the reason away along with the "oui" it was given for.
  const changed = toast(page, "Vous ne venez pas — Weekend musical.");
  await expect(changed).toBeVisible();
  // COUNTED ONCE. A toast closes itself after a few seconds, so
  // `toHaveCount(0)` waits for that and passes whatever the toast carried.
  // Found by sonner's own attribute, because this toast is raised while the
  // withdraw dialog is still open, and the dialog hides everything outside it
  // from the accessibility tree, so a role query finds no button either way.
  // Both of those versions passed against a toast that offered the undo.
  expect(await undoIn(changed).count(), "a changed answer offers an undo").toBe(0);
});

test("a first answer can be undone from its toast, back to no answer at all", async ({ page }) => {
  await logIn(page, "demo.player");
  await page.goto("/events");

  const card = page.getByTestId("event-card").filter({ hasText: "Vendanges Cheyres" });
  const notComing = card.getByRole("button", { name: "Je ne viens pas à Vendanges Cheyres" });

  // A first "non" is one tap: there is no "oui" to take back, so no reason.
  await notComing.click();
  await expect(notComing).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("alertdialog")).toHaveCount(0);
  await expect.poll(() => storedAnswer(page, "Vendanges Cheyres")).toMatchObject({ status: "no" });

  // The same locator the change's toast is counted with, so that count is
  // known to find an undo when there is one.
  await undoIn(toast(page, "Vous ne venez pas — Vendanges Cheyres.")).click();

  await expect(notComing).toHaveAttribute("aria-pressed", "false");
  await expect(card.getByRole("button", { name: "Je viens à Vendanges Cheyres" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  await expect.poll(() => storedAnswer(page, "Vendanges Cheyres")).toBeNull();
});

/**
 * PAST THE DATE, NO BUTTONS. The API would take the write, but asking whether
 * somebody is coming to a rehearsal that finished last week invites nonsense;
 * a late correction belongs to the committee's list.
 */
test("an event that has already happened can no longer be answered from the planning", async ({
  page,
}) => {
  await logIn(page, "demo.player");
  await page.goto("/events");
  // The upcoming view does carry the controls, so their absence below means
  // something.
  await expect(page.getByTestId("attendance-controls").first()).toBeVisible();

  await page.getByRole("radio", { name: "Passés" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Événements passés" })).toBeVisible();
  await expect(page.getByTestId("event-card").first()).toBeVisible();

  await expect(page.getByTestId("attendance-controls")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Je viens à/ })).toHaveCount(0);
});
