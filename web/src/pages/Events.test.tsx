import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Events } from "./Events";

/**
 * Every overflow trigger currently on the page, whichever card it belongs to
 * and whichever locale renders it.
 *
 * MATCHED BY `aria-haspopup="menu"`, NOT BY NAME. A name-based regex anchored
 * on "Autres actions pour" can only ever match French, so a German test
 * calling the same clause would find the assertion trivially true — it would
 * assert nothing, and read as coverage while proving nothing. That is exactly
 * the failure #118's review caught for the item itself; the trigger's own
 * absence check had it too, one layer up.
 *
 * IT COUNTS THE PAGE-LEVEL "Ajouter" TRIGGER TOO, since #182 — that one is a
 * menu button like any other. So this is only meaningful for a reader WITHOUT
 * `events.manage`, which is every current caller (demo.player, demo.committee).
 * Call it under demo.direction or demo.both and it returns 1 before you have
 * asserted anything, and the failure looks like the row action you were
 * actually testing. Scope the query to a card in that case.
 */
function overflowTriggers(): HTMLElement[] {
  return screen
    .queryAllByRole("button")
    .filter((button) => button.getAttribute("aria-haspopup") === "menu");
}

/**
 * Open one card's overflow menu and return a scope to query inside.
 *
 * WHY THIS EXISTS RATHER THAN A BARE getByRole. A Radix item is portalled to
 * document.body, so `within(card)` cannot see it once the menu is open, and a
 * page-wide query cannot tell two cards apart. So the TRIGGER is found inside
 * its own card — three seeded rehearsals share the title "Répétition", which
 * makes even the trigger's title-carrying name non-unique on the page — and
 * the menu is found at the top level, where there is only ever one open.
 *
 * The name is passed in whole rather than built from the French, because the
 * German test opens the same menu by its German name.
 */
async function openMenuFor(
  user: ReturnType<typeof userEvent.setup>,
  card: HTMLElement,
  triggerName: string,
): Promise<HTMLElement> {
  await user.click(within(card).getByRole("button", { name: triggerName }));
  return screen.findByRole("menu");
}

/** The first card for an event with this title; the rehearsals share one. */
function cardFor(title: string): HTMLElement {
  const card = screen
    .getAllByTestId("event-card")
    .find((candidate) => within(candidate).getByTestId("event-title").textContent === title);
  if (!card) {
    throw new Error(`no card for "${title}"`);
  }
  return card;
}

/**
 * Assert an action is nowhere on this screen — not inline, and not behind a
 * shut menu either.
 *
 * WHY ABSENCE NEEDS TWO HALVES NOW. An action that has moved into a dropdown
 * is not in the DOM until somebody opens it, so a page-wide query for it is
 * null whatever the screen decided about permissions. Four assertions in this
 * file would have gone on passing for every reader, silently, which is the
 * failure #118's review caught. The second half — that no trigger exists to
 * be hiding it — is what restores the meaning, and it is available only to a
 * reader whose whole action list is inline: RowActions draws no trigger for
 * fewer than two menu items. Where a trigger legitimately exists, open it and
 * query within the menu instead.
 */
function expectNoSuchAction(name: RegExp): void {
  // queryAllByRole rather than queryByRole: the planning holds several cards,
  // so the gate this guards against losing brings back one control PER CARD.
  // The singular query then throws "found multiple elements", which is a
  // failure of the right test for the wrong reason and reads as a broken
  // query rather than as a lost permission.
  expect(screen.queryAllByRole("link", { name })).toHaveLength(0);
  expect(screen.queryAllByRole("button", { name })).toHaveLength(0);
  expect(overflowTriggers()).toHaveLength(0);
}

async function renderPlanning(
  as: "demo.player" | "demo.direction" | "demo.committee" = "demo.player",
  locale: Locale = "fr",
) {
  setMockUser(as);
  const result = await renderWithSession(<Events />, { route: "/events", locale });
  await screen.findAllByTestId("event-card");
  return result;
}

/** The cards of the top block, which is the one #95 is about. */
function owedCards(): HTMLElement[] {
  return within(screen.getByRole("region", { name: "À répondre" })).getAllByTestId("event-card");
}

/** An answer button inside the top block, re-queried because the tree rerenders. */
function owedButton(name: string): HTMLElement {
  return within(screen.getByRole("region", { name: "À répondre" })).getByRole("button", { name });
}

function owedCardFor(title: string): HTMLElement {
  const card = owedCards().find((candidate) => within(candidate).queryByText(title) !== null);
  if (!card) {
    throw new Error(`no card for "${title}" in À répondre`);
  }
  return card;
}

/** Where a card sits among its neighbours, which is what must not change. */
function positionOf(title: string): number {
  return owedCards().findIndex((card) => within(card).queryByText(title) !== null);
}

/**
 * Switch the list between its two halves.
 *
 * A RADIO, NOT A BUTTON. The control is `ui/radio-group.tsx`, which Radix
 * renders as a radiogroup — so a query for a button
 * named "Passés" finds nothing, and the old `getByRole("button", { name: "Voir
 * les événements passés" })` finds nothing either, because that string no
 * longer exists in any catalogue. #182.
 */
async function switchView(
  user: ReturnType<typeof userEvent.setup>,
  to: "Planning" | "Passés",
): Promise<void> {
  await user.click(screen.getByRole("radio", { name: to }));
}

test("the view switch is a named radiogroup showing which half is on screen", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.player");

  expect(screen.getByRole("radiogroup", { name: "Vue du planning" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Planning" })).toBeChecked();
  expect(screen.getByRole("radio", { name: "Passés" })).not.toBeChecked();
  expect(screen.getByRole("heading", { name: "À répondre" })).toBeInTheDocument();

  await switchView(user, "Passés");

  expect(await screen.findByRole("radio", { name: "Passés" })).toBeChecked();
  expect(screen.queryByRole("heading", { name: "À répondre" })).toBeNull();
  expect(screen.getByRole("heading", { level: 2, name: "Événements passés" })).toBeInTheDocument();
});

/**
 * THE VIEW SURVIVES A SECOND PRESS. Not a guard in this file — a radio group
 * has no cleared state to fall into — but the planning is where it would have
 * been visible, so this is the screen-level proof that the primitive's property
 * actually reaches the reader. ui/radio-group.test.tsx pins the primitive half.
 */
test("pressing the half already on screen leaves the view where it is", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.player");

  await switchView(user, "Planning");

  expect(screen.getByRole("radio", { name: "Planning" })).toBeChecked();
  expect(screen.getAllByTestId("event-card")).toHaveLength(6);
  expect(screen.getByRole("heading", { name: "À répondre" })).toBeInTheDocument();
});

test("lists the planning for an ordinary player", async () => {
  await renderPlanning();
  expect(screen.getAllByTestId("event-card").length).toBeGreaterThan(0);
});

test("a player is offered no way to create an event", async () => {
  // ABSENT, not refused: a control that leads to "Accès refusé" teaches people
  // that parts of the site are broken for them.
  //
  // THE TRIGGER'S ABSENCE IS THE ASSERTION. Both create links moved into a
  // dropdown in #182, and a Radix menu item is not in the DOM until the menu
  // opens — so the queryByRole for "Ajouter un événement" this test used to
  // make is now null for an organiser too, and passed for everybody. That is
  // the failure docs/traps.md has an entry for, and this screen is its first
  // customer.
  //
  // MATCHED BY aria-haspopup, NEVER by a French accessible name: on /de/* the
  // French name matches nothing and the clause carrying the meaning would pass
  // vacuously.
  await renderPlanning("demo.player");

  // THROUGH THE HELPER, which is this assertion three ways and already carries
  // the reasoning for each. Spelling them out here again was a second copy of
  // its body, and a second place to fix if the shape of "absent" ever changes.
  expectNoSuchAction(/Ajouter/);
});

test("an organiser gets both ways to create, behind one trigger", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  // ONE CONTROL ON THE HEADING'S LINE, and the two destinations inside it.
  const trigger = screen.getByRole("button", { name: "Ajouter au planning" });
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");

  await user.click(trigger);

  const menu = await screen.findByRole("menu");
  // REAL ANCHORS, not a useNavigate call: middle-click and open-in-new-tab on
  // the event form are things a committee member does. asChild straight to
  // Link, one Slot layer — see RowActions' ItemFor docblock for why two drops
  // the props.
  expect(within(menu).getByRole("menuitem", { name: "Ajouter un événement" })).toHaveAttribute(
    "href",
    "/events/new",
  );
  expect(within(menu).getByRole("menuitem", { name: "Ajouter une série" })).toHaveAttribute(
    "href",
    "/events/new/series",
  );
});

test("the past REPLACES the planning rather than extending it", async () => {
  const user = userEvent.setup();
  await renderPlanning();

  // The seeded mock has six upcoming and exactly one past, so the two halves
  // are distinguishable by count as well as by content — a toggle that merely
  // appended would show seven.
  expect(screen.getAllByTestId("event-card")).toHaveLength(6);

  await switchView(user, "Passés");

  expect(await screen.findByRole("radio", { name: "Passés" })).toBeChecked();
  await expect.poll(() => screen.getAllByTestId("event-card").length).toBe(1);
});

test("an event carries its where and its when", async () => {
  await renderPlanning();
  const cards = screen.getAllByTestId("event-card");
  const first = cards[0] as HTMLElement;

  expect(within(first).getByTestId("event-when")).not.toBeEmptyDOMElement();
  expect(within(first).getByTestId("event-location")).not.toBeEmptyDOMElement();
});

test("an event with no attire says so rather than leaving a blank", async () => {
  // "Vendanges Cheyres" in the seeded planning has none, and an empty row
  // reads as a value that failed to load.
  await renderPlanning();
  const cheyres = screen
    .getAllByTestId("event-card")
    .find((card) => within(card).queryByText("Vendanges Cheyres")) as HTMLElement;

  expect(within(cheyres).getByTestId("event-attire")).toHaveTextContent("Non précisée");
});

test("an empty planning says so rather than rendering nothing", async () => {
  // A blank screen reads as broken. This is the state a committee sees before
  // they have entered the season, which is the first thing they will ever see.
  // The envelope, not a bare array: an override that answered the old shape
  // would put this test in agreement with nothing the API sends.
  server.use(
    http.get("/api/v1/events", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );

  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });

  expect(await screen.findByText(/Aucun événement au planning/)).toBeInTheDocument();
  // And an organiser is pointed at what to do about it.
  expect(screen.getByText(/générez toute une saison/)).toBeInTheDocument();
});

/**
 * Case 1 of #182's heading defect. `showingPast` alone used to satisfy the
 * heading guard, so a past with nothing in it showed "Aucun événement
 * passé." immediately above a labelled, empty "Événements passés" section —
 * the empty-message block and the section are siblings, not alternatives.
 * Reachable on a fresh site before any event is in the past; the seeded mock
 * always carries exactly one, so the override below removes it.
 */
test("the past view with no past events shows the empty message and no heading", async () => {
  const user = userEvent.setup();
  server.use(
    http.get("/api/v1/events", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );

  setMockUser("demo.player");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findByText(/Aucun événement au planning/);

  await switchView(user, "Passés");

  expect(await screen.findByText(/Aucun événement passé/)).toBeInTheDocument();
  expect(screen.queryByRole("region", { name: "Événements passés" })).toBeNull();
});

test("a failed planning is announced, not silently empty", async () => {
  server.use(http.get("/api/v1/events", () => HttpResponse.error()));

  setMockUser("demo.player");
  await renderWithSession(<Events />, { route: "/events" });

  expect(await screen.findByRole("alert")).toHaveTextContent(/n’a pas pu être chargé/);
});

test("naming the event before deleting it", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");

  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  const title = within(card).getByTestId("event-title").textContent ?? "";
  const menu = await openMenuFor(user, card, `Autres actions pour ${title}`);
  await user.click(within(menu).getByRole("menuitem", { name: `Supprimer ${title}` }));

  // "Êtes-vous sûr ?" is a question nobody reads. The name is what makes the
  // dialog worth stopping for.
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName(expect.stringContaining(title));
});

test("the dialog names what goes with the event, not only the event", async () => {
  // The API deletes every attendance answer and every public registration
  // attached to it, and says so in its own docblock. A confirmation that
  // mentioned neither would be naming half the damage.
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");

  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  const title = within(card).getByTestId("event-title").textContent ?? "";
  const menu = await openMenuFor(user, card, `Autres actions pour ${title}`);
  await user.click(within(menu).getByRole("menuitem", { name: `Supprimer ${title}` }));

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(/réponses/);
  expect(dialog).toHaveTextContent(/inscriptions/);
});

test("a player is offered no delete at all", async () => {
  setMockUser("demo.player");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");

  // NO MENU AT ALL for a player: the screen passes no actions, so there is no
  // trigger to open. The trigger's absence is what makes this fail if the
  // permission gate goes — a queryByRole for the item itself would pass on a
  // closed menu and tell us nothing.
  expectNoSuchAction(/^Supprimer/);
});

test("deleting removes it from the planning", async () => {
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");
  const before = screen.getAllByTestId("event-card").length;

  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  const title = within(card).getByTestId("event-title").textContent ?? "";
  const menu = await openMenuFor(user, card, `Autres actions pour ${title}`);
  await user.click(within(menu).getByRole("menuitem", { name: `Supprimer ${title}` }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  // A findByText matching any non-empty node matches every node on the page
  // and throws for multiple matches. Polling the count
  // is what the rest of this file already does.
  await expect.poll(() => screen.getAllByTestId("event-card").length).toBe(before - 1);
});

test("a delete carries the tag of the read it was confirmed from", async () => {
  // DELETE is a conditional write (ADR 0013): refused 428 without an If-Match and
  // 412 with a stale one. The planning hands out no tag — one tag cannot
  // validate five rows — so opening the dialog is also the read. Without that
  // read the mocked backend refuses exactly as the real one does, and this
  // test is what says so.
  const user = userEvent.setup();
  let sentIfMatch: string | null = null;
  server.events.on("request:start", ({ request }) => {
    if (request.method === "DELETE") {
      sentIfMatch = request.headers.get("If-Match");
    }
  });

  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");

  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  const title = within(card).getByTestId("event-title").textContent ?? "";
  const menu = await openMenuFor(user, card, `Autres actions pour ${title}`);
  await user.click(within(menu).getByRole("menuitem", { name: `Supprimer ${title}` }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));

  await expect.poll(() => sentIfMatch).not.toBeNull();
});

test("the delete dialog opens from the menu and is usable once the menu has gone", async () => {
  // THE DIALOG BELONGS TO THE SCREEN, NOT TO THE MENU ITEM'S SUBTREE, and
  // this is what says so. A menu closes as it hands over the selection,
  // unmounting everything it rendered — so a ConfirmByTypingName placed
  // inside DropdownMenuContent never appears at all. That is the failure a
  // reader would meet, and unlike the menu's `modal` prop it is falsifiable.
  //
  // MUTATION TEST: render the dialog as a child of DropdownMenuContent and
  // findByRole("alertdialog") below times out.
  //
  // The event dialog carries NO FIELD to type into — ConfirmByTypingName's
  // `confirmPhrase` is deliberately unset here, because typing a title back
  // is friction with nothing behind it — so what stands in for "and it can be
  // typed into" is the confirmation going through with the menu gone: focus
  // and pointer both reach the dialog after the handoff.
  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");
  const before = screen.getAllByTestId("event-card").length;

  const menu = await openMenuFor(
    user,
    cardFor("Souper de soutien"),
    "Autres actions pour Souper de soutien",
  );
  await user.click(within(menu).getByRole("menuitem", { name: /^Supprimer/ }));

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName(expect.stringContaining("Souper de soutien"));
  await expect.poll(() => screen.queryByRole("menu")).toBeNull();

  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));
  await expect.poll(() => screen.getAllByTestId("event-card").length).toBe(before - 1);
});

/* -------------------------------------------------------------------------- *
 * Answering, from the planning
 * -------------------------------------------------------------------------- */

test("what you still owe an answer on is pinned above the rest", async () => {
  // The seeded answers give demo.player one answered event out of six, so the
  // two blocks are distinguishable by count as well as by heading.
  await renderPlanning();

  const awaiting = screen.getByRole("region", { name: "À répondre" });
  const rest = screen.getByRole("region", { name: "Le reste du planning" });

  expect(within(awaiting).getAllByTestId("event-card")).toHaveLength(5);
  expect(within(rest).getAllByTestId("event-card")).toHaveLength(1);
});

test("answering is one tap and leaves the card where it is", async () => {
  // #95. The card used to drop out of À répondre the moment it was tapped, and
  // the next event's buttons arrived under the finger — on a phone, roughly at
  // the pixel the thumb had just left. The top block is a snapshot of what was
  // owed when the screen was built, so answering changes the card and moves
  // nothing.
  await renderPlanning();

  const before = owedCards().length;
  const position = positionOf("Vendanges Cheyres");

  await userEvent.click(owedButton("Je viens à Vendanges Cheyres"));

  await expect
    .poll(() => owedButton("Je viens à Vendanges Cheyres").getAttribute("aria-pressed"))
    .toBe("true");

  expect(owedCards()).toHaveLength(before);
  expect(positionOf("Vendanges Cheyres")).toBe(position);
  expect(
    within(screen.getByRole("region", { name: "Le reste du planning" })).getAllByTestId(
      "event-card",
    ),
  ).toHaveLength(1);
});

test("the tapped answer keeps focus", async () => {
  // The two blocks are two different parents, so a card that moves between
  // them is unmounted and mounted — destroying the node the focus is on and
  // sending a screen reader's cursor back to the top of the page after every
  // answer.
  //
  // MUTATION TEST: partition on `myAttendance` alone in Events and this fails,
  // because the button this holds is no longer in the document.
  await renderPlanning();

  const button = owedButton("Je viens à Vendanges Cheyres");
  await userEvent.click(button);

  await expect.poll(() => button.getAttribute("aria-pressed")).toBe("true");
  expect(button).toHaveFocus();
});

test("a card answered in place says so, under a heading that says what is left", async () => {
  // The pressed button says what was answered. It does not explain why an
  // answered card is sitting under "À répondre", which is what the marker and
  // the count line are for.
  await renderPlanning();

  expect(screen.getByTestId("owed-count")).toHaveTextContent("Il reste 5 événements sans réponse.");

  await userEvent.click(owedButton("Je viens à Vendanges Cheyres"));

  await expect
    .poll(() => screen.getByTestId("owed-count").textContent)
    .toContain("Il reste 4 événements sans réponse.");

  const card = owedCardFor("Vendanges Cheyres");
  expect(within(card).getByTestId("answered-in-place")).toHaveTextContent("Répondu");
});

test("answering everything says so without emptying the block", async () => {
  await renderPlanning();

  // Collected before the first click, which is safe only because none of them
  // moves: the old behaviour reordered the list under each tap in turn.
  const buttons = within(screen.getByRole("region", { name: "À répondre" })).getAllByRole(
    "button",
    { name: /^Je viens à/ },
  );
  for (const button of buttons) {
    await userEvent.click(button);
  }

  await expect.poll(() => screen.getByTestId("owed-count").textContent).toBe("Tout est répondu.");
  expect(owedCards()).toHaveLength(5);
});

test("switching to the past and back settles the answered card into the rest", async () => {
  const user = userEvent.setup();
  await renderPlanning();

  await userEvent.click(owedButton("Je viens à Vendanges Cheyres"));
  await expect
    .poll(() => owedButton("Je viens à Vendanges Cheyres").getAttribute("aria-pressed"))
    .toBe("true");

  await switchView(user, "Passés");
  await switchView(user, "Planning");

  // The hold is released by rebuilding the list, never by a timer and never by
  // data arriving on its own.
  await expect.poll(() => owedCards().length).toBe(4);
  expect(
    within(screen.getByRole("region", { name: "Le reste du planning" })).getByRole("button", {
      name: "Je viens à Vendanges Cheyres",
    }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("filtering by day settles the block too", async () => {
  await renderPlanning();

  await userEvent.click(owedButton("Je viens à Vendanges Cheyres"));
  await expect
    .poll(() => owedButton("Je viens à Vendanges Cheyres").getAttribute("aria-pressed"))
    .toBe("true");

  await userEvent.click(screen.getByRole("button", { name: "Calendrier" }));
  const calendar = await screen.findByTestId("event-calendar");
  const [firstDay] = within(calendar)
    .getAllByRole("button", { pressed: false })
    .filter((button) => (button.getAttribute("aria-label") ?? "").includes("événement"));
  await userEvent.click(firstDay as HTMLElement);

  // One event left on screen, and it is partitioned on what it actually is
  // rather than on what was owed when the page opened.
  await expect.poll(() => screen.getAllByTestId("event-card").length).toBe(1);
  expect(screen.queryByTestId("answered-in-place")).toBeNull();
});

test("the answer is on screen before the server has replied", async () => {
  // THE SCREEN MOVES BEFORE THE NETWORK DOES, which is the whole of #95's
  // first half: a tap on a bad connection must not be a button that does
  // nothing for two seconds. The handler here is held open, so every
  // assertion below runs while the request is still in flight.
  //
  // MUTATION TEST: move the `patchMyAttendance` call in AttendanceControls
  // below its `await record.mutateAsync` and this fails — the card sits in
  // À répondre until the response lands.
  let release: () => void = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let answered = false;

  server.use(
    http.put("/api/v1/events/:id/attendance", async () => {
      await held;
      answered = true;
      return HttpResponse.json({
        status: "yes",
        note: null,
        recordedByDirection: false,
        recordedAt: new Date().toISOString(),
      });
    }),
  );

  await renderPlanning();

  const awaiting = screen.getByRole("region", { name: "À répondre" });
  await userEvent.click(
    within(awaiting).getByRole("button", { name: "Je viens à Vendanges Cheyres" }),
  );

  await expect
    .poll(() => owedButton("Je viens à Vendanges Cheyres").getAttribute("aria-pressed"))
    .toBe("true");

  // ...and the list has not moved while it was in flight either.
  expect(owedCards()).toHaveLength(5);

  // Let the held request finish, so the component is not still writing to a
  // cache while the next test tears the tree down. The toast that follows it
  // is raised into a Toaster this test does not render — Layout owns that —
  // so the handler itself is what says the round trip is over.
  release();
  await waitFor(() => expect(answered).toBe(true));
});

test("taking back a yes opens the dialog rather than answering", async () => {
  await renderPlanning();

  const rest = screen.getByRole("region", { name: "Le reste du planning" });
  await userEvent.click(within(rest).getByRole("button", { name: /^Je ne viens pas à/ }));

  expect(await screen.findByRole("alertdialog")).toHaveTextContent("Vous ne venez plus à");
});

test("the dialog will not submit until a reason is typed", async () => {
  // MUTATION TEST: delete `armed` from WithdrawDialog and the first assertion
  // fails — the button becomes pressable with an empty field, and the member
  // meets the server's refusal instead of the question.
  await renderPlanning();

  const rest = screen.getByRole("region", { name: "Le reste du planning" });
  await userEvent.click(within(rest).getByRole("button", { name: /^Je ne viens pas à/ }));

  const dialog = await screen.findByRole("alertdialog");
  const confirm = within(dialog).getByRole("button", { name: "Je ne viens pas" });

  expect(confirm).toHaveAttribute("aria-disabled", "true");

  await userEvent.type(within(dialog).getByLabelText("Raison"), "Malade");
  expect(confirm).toHaveAttribute("aria-disabled", "false");
});

test("a reason travels with the withdrawal and is shown back", async () => {
  await renderPlanning();

  const rest = screen.getByRole("region", { name: "Le reste du planning" });
  await userEvent.click(within(rest).getByRole("button", { name: /^Je ne viens pas à/ }));

  const dialog = await screen.findByRole("alertdialog");
  await userEvent.type(within(dialog).getByLabelText("Raison"), "Malade");
  await userEvent.click(within(dialog).getByRole("button", { name: "Je ne viens pas" }));

  const card = within(screen.getByRole("region", { name: "Le reste du planning" })).getAllByTestId(
    "event-card",
  )[0] as HTMLElement;

  await expect
    .poll(() => within(card).queryByTestId("attendance-note")?.textContent)
    .toContain("Malade");
});

test("the server's own refusal lands under the field it is about", async () => {
  // The client-side guard above only spares a round trip. THIS is the rule:
  // App\Support's reason requirement, rendered by translateApiError against
  // `fields.note` — which is why `note` has to carry French copy in
  // web/src/i18n/fr.ts, and why ApiErrorVocabularyTest reads that file.
  server.use(
    http.put("/api/v1/events/:id/attendance", () =>
      HttpResponse.json(
        {
          title: "Invalid form submission",
          status: 400,
          instance: "",
          code: "validation_failed",
          errors: [{ field: "note", reason: "required" }],
          requestId: "01JB3K7QW8ZXMOCKMOCKMOCK00",
          detail: "",
        },
        { status: 400, headers: { "Content-Type": "application/problem+json" } },
      ),
    ),
  );

  await renderPlanning();

  const rest = screen.getByRole("region", { name: "Le reste du planning" });
  await userEvent.click(within(rest).getByRole("button", { name: /^Je ne viens pas à/ }));

  const dialog = await screen.findByRole("alertdialog");
  await userEvent.type(within(dialog).getByLabelText("Raison"), "  ");
  await userEvent.type(within(dialog).getByLabelText("Raison"), "x");
  await userEvent.click(within(dialog).getByRole("button", { name: "Je ne viens pas" }));

  expect(await within(dialog).findByText(/Raison est obligatoire/)).toBeInTheDocument();
});

test("somebody in no register is asked nothing", async () => {
  // Dominique Direction organises and plays in nothing, so `myAttendance` is
  // null on every event for her — which a naive split would file under
  // "À répondre" and then offer her no way to answer. The API would refuse her
  // with 403 not_answerable, and a block of questions nobody may answer is
  // worse than the refusal.
  await renderPlanning("demo.direction");

  expect(screen.queryByRole("region", { name: "À répondre" })).toBeNull();
  expect(screen.queryAllByTestId("attendance-controls")).toHaveLength(0);
});

/* -------------------------------------------------------------------------- *
 * The calendar
 * -------------------------------------------------------------------------- */

test("the calendar is absent unless the server turns it on", async () => {
  // The flag comes from GET /api/v1/config, so it is the server's answer
  // rather than something baked into a bundle three environments share. It is
  // off everywhere until somebody has looked at the calendar on TEST, and this
  // is what says the SPA obeys that.
  server.use(http.get("/api/v1/config", () => HttpResponse.json({ env: "dev", features: {} })));

  await renderPlanning();

  expect(screen.queryByRole("button", { name: "Calendrier" })).toBeNull();
});

test("the calendar filters the list instead of navigating to a day", async () => {
  await renderPlanning();

  await userEvent.click(screen.getByRole("button", { name: "Calendrier" }));
  const calendar = await screen.findByTestId("event-calendar");

  // The seeded planning puts exactly one event on each of its five days, so a
  // day with anything on it is a day with one thing on it.
  const [firstDay] = within(calendar)
    .getAllByRole("button", { pressed: false })
    .filter((button) => (button.getAttribute("aria-label") ?? "").includes("événement"));
  await userEvent.click(firstDay as HTMLElement);

  await expect.poll(() => screen.getAllByTestId("event-card").length).toBe(1);
  // Still on the planning: the calendar is an overview and never a second way
  // to do the primary job.
  expect(screen.getByRole("heading", { name: "Planning" })).toBeInTheDocument();
});

test("a narrowed planning says so at every width, and can be widened again", async () => {
  // The calendar itself is hidden below md, so a resize can take away the only
  // control that set the filter. Without this line the planning has silently
  // lost most of its events.
  await renderPlanning();

  await userEvent.click(screen.getByRole("button", { name: "Calendrier" }));
  const calendar = await screen.findByTestId("event-calendar");
  const [firstDay] = within(calendar)
    .getAllByRole("button")
    .filter((button) => (button.getAttribute("aria-label") ?? "").includes("événement"));
  await userEvent.click(firstDay as HTMLElement);

  expect(await screen.findByTestId("day-filter")).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Voir tout le planning" }));
  await expect.poll(() => screen.queryByTestId("day-filter")).toBeNull();
  await expect.poll(() => screen.getAllByTestId("event-card").length).toBe(6);
});

/* ---------------------------------------------------------------------------
 * The way in to the two registration screens
 * -------------------------------------------------------------------------- */

/**
 * THE POINT OF #118, asserted positively. Every other test that touches
 * "Qui vient" proves an absence — for demo.committee, above, and for a
 * player, below — and the one place that should prove its presence never
 * did. `inlineKey="attendance"` is the whole promise of this branch: the
 * weekly action stays a plain link on the page, never a tap into a menu.
 *
 * MUTATION TEST: drop `inlineKey="attendance"` from Events.tsx's
 * `RowActions` call (or reorder `actions` so attendance is no longer first)
 * and this fails — the link moves inside the "..." and `getByRole("link")`
 * finds nothing until the menu is opened.
 */
test("Qui vient stays a plain link, never behind the menu", async () => {
  await renderPlanning("demo.direction");

  const souper = cardFor("Souper de soutien");

  // A LINK, OUTSIDE ANY MENU: no menu was opened above this assertion, so a
  // Radix `menuitem` — portalled and absent until its trigger is clicked —
  // could not satisfy it even by accident.
  expect(
    within(souper).getByRole("link", { name: "Qui vient à Souper de soutien" }),
  ).toHaveAttribute("href", "/events/7/attendance");
});

/**
 * MUTATION TEST: drop `event.takesRegistrations` from the condition and this
 * fails. The planning is mostly rehearsals, and every one of their cards would
 * otherwise carry a link to a guest list that can never fill up.
 */
test("offers the guest list only on an event that takes bookings", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  const souper = await openMenuFor(
    user,
    cardFor("Souper de soutien"),
    "Autres actions pour Souper de soutien",
  );
  expect(
    within(souper).getByRole("menuitem", { name: "Inscriptions à Souper de soutien" }),
  ).toHaveAttribute("href", "/events/7/registrations");

  // Shut before opening the next one. Two menus open at once would make
  // findByRole("menu") ambiguous, and the reader can only have one anyway.
  //
  // WAITED FOR, NOT ASSUMED. Radix's `Presence` unmounts synchronously in
  // jsdom today, which is what let this go on working without the poll —
  // but `openMenuFor` below is a bare `findByRole`, which is happy to
  // resolve against a menu still mid-teardown. Matches the wait this file
  // already does at line ~333, for the identical race.
  await user.keyboard("{Escape}");
  await expect.poll(() => screen.queryByRole("menu")).toBeNull();

  // ASSERTED FROM INSIDE THE OPEN MENU, unlike the version this replaces. An
  // organiser does have a trigger on a rehearsal — three other actions live
  // behind it — so a page-wide query here would be null whether the gate held
  // or not.
  const rehearsal = await openMenuFor(
    user,
    cardFor("Répétition"),
    "Autres actions pour Répétition",
  );
  expect(
    within(rehearsal).queryByRole("menuitem", { name: /^Inscriptions à Répétition/ }),
  ).toBeNull();
});

/**
 * The options editor, unlike the guest list, belongs on EVERY card: an event
 * that takes no bookings yet is exactly when the committee fills it in.
 */
test("offers the options editor on every event, bookable or not", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  const souper = await openMenuFor(
    user,
    cardFor("Souper de soutien"),
    "Autres actions pour Souper de soutien",
  );
  expect(
    within(souper).getByRole("menuitem", { name: "Ce qui peut être réservé à Souper de soutien" }),
  ).toHaveAttribute("href", "/events/7/registration-options");

  // WAITED FOR, NOT ASSUMED — see the identical comment above this test's
  // sibling, "offers the guest list only on an event that takes bookings".
  await user.keyboard("{Escape}");
  await expect.poll(() => screen.queryByRole("menu")).toBeNull();

  const rehearsal = await openMenuFor(
    user,
    cardFor("Répétition"),
    "Autres actions pour Répétition",
  );
  expect(
    within(rehearsal).getByRole("menuitem", { name: /^Ce qui peut être réservé à Répétition/ }),
  ).toBeInTheDocument();
});

/**
 * `registrations.view` is ALL the `committee` role holds. It opens the guest
 * list and nothing else — no event form, no chase list, no options editor.
 */
test("a guest-list reader gets that link and no other", async () => {
  await renderPlanning("demo.committee");

  // ONE ACTION, THEREFORE NO MENU. RowActions draws no trigger for fewer than
  // two items behind it — a "..." over a single entry is a tap to reveal a
  // button — so this reader's whole action list is inline and the guest list
  // is still a plain link.
  expect(
    screen.getByRole("link", { name: "Inscriptions à Souper de soutien" }),
  ).toBeInTheDocument();

  // THE TRIGGER'S ABSENCE IS THE ASSERTION, which is why these two go through
  // the helper. The bare queryByRole they used to be would now be null for
  // everybody, an organiser included, because a shut menu holds nothing.
  expectNoSuchAction(/^Ce qui peut être réservé/);
  expectNoSuchAction(/^Modifier/);

  // STILL A PAGE-WIDE QUERY, unlike the two above: this action is the inline
  // one, so it is in the DOM whenever it exists at all.
  expect(screen.queryAllByRole("link", { name: /^Qui vient/ })).toHaveLength(0);
});

test("a player is told nothing about answers or bookings", async () => {
  // Mirrors EventCountsTest::test_a_player_is_told_nothing_about_answers at
  // the UI layer. The API has already withheld the numbers; this asserts the
  // screen does not invent them.
  await renderPlanning("demo.player");
  expect(screen.queryAllByTestId("event-meta")).toHaveLength(0);
});

test("an organiser sees the public chip and the answer fraction", async () => {
  await renderPlanning("demo.direction");
  const strips = screen.getAllByTestId("event-meta");
  expect(strips.length).toBeGreaterThan(0);
  expect(screen.getAllByText(/réponses$/).length).toBeGreaterThan(0);

  // Pinned to specific cards rather than counted: the seed's public events
  // are Cheyres AND the souper (both take bookings from the public), so a
  // count of "Public" chips would both break the moment anyone seeds another
  // one and pass while the chip sat on the wrong card entirely.
  const cheyres = screen
    .getAllByTestId("event-card")
    .find((card) => within(card).queryByText("Vendanges Cheyres")) as HTMLElement;
  const weekend = screen
    .getAllByTestId("event-card")
    .find((card) => within(card).queryByText("Weekend musical")) as HTMLElement;

  expect(within(cheyres).getByText("Public")).toBeInTheDocument();
  expect(within(weekend).queryByText("Public")).toBeNull();
});

test("the booking count appears only on an event that takes bookings", async () => {
  await renderPlanning("demo.committee");

  // Pinned to specific cards for the same reason as the public chip above:
  // a count can pass while sat on the wrong card, so this checks the mapping
  // rather than the total.
  const souper = screen
    .getAllByTestId("event-card")
    .find((card) => within(card).queryByText("Souper de soutien")) as HTMLElement;
  const rehearsal = screen
    .getAllByTestId("event-card")
    .find((card) => within(card).queryByText("Répétition")) as HTMLElement;

  expect(within(souper).getByText(/personnes?$|^Aucune inscription$/)).toBeInTheDocument();
  expect(within(rehearsal).queryByText(/personnes?$|^Aucune inscription$/)).toBeNull();
});

test("the past keeps the strip", async () => {
  // The fraction stops being a chase cue and becomes a record of who
  // answered, which is worth having on the screen that shows the past.
  const user = userEvent.setup();
  await renderPlanning("demo.direction");
  await switchView(user, "Passés");
  await waitFor(() => expect(screen.getAllByTestId("event-card")).toHaveLength(1));
  expect(screen.getAllByTestId("event-meta")).toHaveLength(1);
});

test("the withdrawal dialog is German, and its Annuler is Abbrechen", async () => {
  // THE BLOCK NAMES ARE GERMAN AS OF #154. This test was written in #155,
  // when AttendanceControls was translated and the page around it was not, and
  // it queried "Le reste du planning" with a comment saying so. That the query
  // had to change here is the two slices meeting, not a regression.
  await renderPlanning("demo.player", "de-CH");

  const rest = screen.getByRole("region", { name: "Die übrige Planung" });
  await userEvent.click(within(rest).getByRole("button", { name: /^Ich komme nicht zu/ }));

  const dialog = await screen.findByRole("alertdialog");

  // TIGHT GUILLEMETS AND NO SPACE BEFORE THE "?", both of which French takes
  // and German does not. They were hardcoded in the JSX around the title, so
  // the whole sentence is one catalogue string now.
  expect(dialog).toHaveTextContent("Sie kommen nicht mehr zu «Répétition»?");

  const confirm = within(dialog).getByRole("button", { name: "Ich komme nicht" });
  expect(confirm).toHaveAttribute("aria-disabled", "true");

  // ABBRECHEN HERE, RÜCKGÄNGIG IN THE TOAST. One French word, "Annuler", for
  // two different German ones — so common.cancel and attendance.undo are two
  // keys and must stay two. AttendanceUndo.test.tsx pins the other half.
  expect(within(dialog).getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
  expect(within(dialog).queryByRole("button", { name: "Rückgängig" })).toBeNull();

  await userEvent.type(within(dialog).getByLabelText("Begründung"), "Krank");
  expect(confirm).toHaveAttribute("aria-disabled", "false");

  await userEvent.click(confirm);

  const card = within(screen.getByRole("region", { name: "Die übrige Planung" })).getAllByTestId(
    "event-card",
  )[0] as HTMLElement;

  // The reason comes back in German quotes, and the member's own words are
  // untouched between them.
  await expect
    .poll(() => within(card).queryByTestId("attendance-note")?.textContent)
    .toBe("«Krank»");
});

/* ---------------------------------------------------------------------------
 * The planning in German (#154)
 * -------------------------------------------------------------------------- */

test("the planning reads in German, card labels included", async () => {
  await renderPlanning("demo.player", "de-CH");

  expect(screen.getByRole("heading", { level: 1, name: "Planung" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Zu beantworten" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Die übrige Planung" })).toBeInTheDocument();
  expect(screen.getByRole("radiogroup", { name: "Ansicht der Planung" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Vergangene Anlässe" })).toBeInTheDocument();

  // NO SPACE BEFORE THE COLON, where French takes a no-break one. These were
  // `<dt>Lieu&nbsp;:</dt>` in the component -- French typography that reached
  // a German page unchanged, which is the Tbd bug of #152 in a third place.
  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  expect(card).toHaveTextContent("Ort:");
  expect(card).toHaveTextContent("Kleidung:");
});

test("THE OWED COUNT MOVES ITS VERB, which is why the plural is not in the component", async () => {
  // German conjugates: "Es fehlt noch 1 Rückmeldung" against "Es fehlen noch
  // 2 Rückmeldungen". French says "Il reste" for both, so the
  // `missing === 1 ? … : …` that used to be here only ever had to swap an "s"
  // and could not have carried this.
  //
  // MUTATION TEST: merge events.owedCount_one into _other and the singular
  // assertion below reads "Es fehlen noch 1 Rückmeldung." -- wrong German that
  // no French test could see.
  await renderPlanning("demo.player", "de-CH");

  expect(screen.getByTestId("owed-count")).toHaveTextContent("Es fehlen noch 5 Rückmeldungen.");

  // Down to one, by answering four of the five.
  const buttons = within(screen.getByRole("region", { name: "Zu beantworten" }))
    .getAllByRole("button", { name: /^Ich komme zu/ })
    .slice(0, 4);
  for (const button of buttons) {
    await userEvent.click(button);
  }

  await expect
    .poll(() => screen.getByTestId("owed-count").textContent)
    .toBe("Es fehlt noch 1 Rückmeldung.");
});

test("the empty planning's hint quotes the button beside it, in German", async () => {
  server.use(
    http.get("/api/v1/events", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );

  const user = userEvent.setup();
  setMockUser("demo.direction");
  await renderWithSession(<Events />, { route: "/events", locale: "de-CH" });

  expect(await screen.findByText("Keine Anlässe in der Planung.")).toBeInTheDocument();

  // THE LABEL IS READ FROM THE MENU ITEM THAT RENDERS IT, so the two cannot
  // drift, and the guillemets are tight -- French sets them « comme ça » and
  // the sentence had that spacing hardcoded in the JSX. The item now sits
  // behind #182's trigger, so it has to be opened before it can be read.
  await user.click(screen.getByRole("button", { name: "Hinzufügen zur Planung" }));
  const action = await screen.findByRole("menuitem", { name: "Serie hinzufügen" });
  expect(screen.getByText(/gleich eine ganze Saison/)).toHaveTextContent(
    `mit «${action.textContent}» gleich eine ganze Saison`,
  );
});

test("the calendar's month and weekday names follow the locale", async () => {
  // THREE MODULE-SCOPE `fr-CH` FORMATTERS lived in EventCalendar.tsx, and
  // WEEKDAYS was a module-scope ARRAY of seven already-formatted strings —
  // computed at import, before any locale exists. Nothing but moving the work
  // to render time could have fixed that one.
  //
  // MUTATION TEST: hoist either back to module scope and this fails, because
  // the French tests above import the same module first.
  await renderPlanning("demo.direction", "de-CH");

  await userEvent.click(screen.getByRole("button", { name: "Kalender" }));
  const calendar = await screen.findByTestId("event-calendar");

  expect(screen.getByTestId("calendar-month").textContent).toMatch(
    /^(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember) \d{4}$/,
  );

  // The weekday strip, Monday first: German short names, and no French one
  // left anywhere in the grid.
  expect(within(calendar).getByText("Mo")).toBeInTheDocument();
  expect(within(calendar).queryByText("lun.")).toBeNull();

  expect(within(calendar).getByRole("button", { name: "Vorheriger Monat" })).toBeInTheDocument();

  // A day's accessible name carries the long date and a counted noun, both
  // German.
  const [firstDay] = within(calendar)
    .getAllByRole("button")
    .filter((button) => (button.getAttribute("aria-label") ?? "").includes("Anlass"));
  expect(firstDay?.getAttribute("aria-label")).toMatch(/^\d+\. \w+ \d{4}, 1 Anlass$/);
});

test("deleting names the event in German, with tight quotes", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction", "de-CH");

  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  const title = within(card).getByTestId("event-title").textContent ?? "";

  // THE MENU IS RENDERED, NOT ONLY KEYED. catalogues.test.ts proves the two
  // files hold the same keys and says in its own docblock that it cannot see
  // French pasted into de.ts — so the trigger and one item are read here by
  // their German accessible names, which is also why openMenuFor takes the
  // whole name rather than building the French one.
  const menu = await openMenuFor(user, card, `Weitere Aktionen für ${title}`);
  expect(within(menu).getByRole("menuitem", { name: `${title} bearbeiten` })).toBeInTheDocument();

  await user.click(within(menu).getByRole("menuitem", { name: `${title} löschen` }));

  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(`«${title}» löschen?`);
  expect(within(dialog).getByRole("button", { name: "Löschen" })).toBeInTheDocument();
  // ConfirmByTypingName's own two words, which belong to no one screen.
  expect(within(dialog).getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();
});

/* ------------------------------------------------------------------------ *
 * Searching (#97)
 * ------------------------------------------------------------------------ */

function titlesOnScreen(): string[] {
  return screen
    .getAllByTestId("event-title")
    .map((title) => title.textContent ?? "")
    .sort();
}

test("typing narrows the planning to the events whose title matches", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  // Accent-free and upper-cased: the server's collation folds both.
  await user.type(screen.getByRole("searchbox", { name: "Rechercher un événement" }), "APERITIF");

  await waitFor(() => expect(titlesOnScreen()).toEqual(["Répétition + apéritif de Noël"]));
});

test("the search matches the place as well as the title", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  await user.type(screen.getByRole("searchbox", { name: "Rechercher un événement" }), "lac noir");

  await waitFor(() => expect(titlesOnScreen()).toEqual(["Weekend musical"]));
});

test("the search carries over to the past", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  await user.type(screen.getByRole("searchbox", { name: "Rechercher un événement" }), "werkhof");
  await waitFor(() => expect(titlesOnScreen()).toHaveLength(3));

  await user.click(screen.getByRole("radio", { name: "Passés" }));

  // The one past rehearsal, which is also at the Werkhof.
  await waitFor(() => expect(titlesOnScreen()).toEqual(["Répétition"]));
});

test("a search that finds nothing says so, without the empty planning's hint", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  await user.type(screen.getByRole("searchbox", { name: "Rechercher un événement" }), "zzz");

  expect(
    await screen.findByText("Aucun événement ne correspond à cette recherche."),
  ).toBeInTheDocument();
  // The committee's "add a series" hint is for a planning with nothing in
  // it, not for words that matched nothing.
  expect(screen.queryByText("Aucun événement au planning.")).not.toBeInTheDocument();
  expect(screen.queryByText(/générez toute une saison/)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Effacer la recherche" }));

  await waitFor(() => expect(titlesOnScreen()).toHaveLength(6));
});

test("a search re-partitions the top block, like a day does", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.player");

  // Perrine owes answers on several events; a search for one of them leaves
  // exactly that one in "À répondre".
  await user.type(screen.getByRole("searchbox", { name: "Rechercher un événement" }), "cheyres");

  await waitFor(() =>
    expect(owedCards().map((card) => within(card).getByTestId("event-title").textContent)).toEqual([
      "Vendanges Cheyres",
    ]),
  );
});
