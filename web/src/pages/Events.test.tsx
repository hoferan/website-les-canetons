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
 * Matched by `aria-haspopup="menu"`, not by name: a French name would match
 * nothing in a German test, and the absence check would pass vacuously.
 *
 * It counts the page-level "Ajouter" trigger too, so it is only meaningful
 * for a reader without `events.manage` (demo.player, demo.committee). Under
 * demo.direction or demo.both it returns 1 before anything is asserted, so
 * scope the query to a card there.
 */
function overflowTriggers(): HTMLElement[] {
  return screen
    .queryAllByRole("button")
    .filter((button) => button.getAttribute("aria-haspopup") === "menu");
}

/**
 * Open one card's overflow menu and return a scope to query inside.
 *
 * A Radix item is portalled to document.body, so `within(card)` cannot see
 * it, and a page-wide query cannot tell cards apart (three seeded rehearsals
 * share the title "Répétition"). So the trigger is found inside its card and
 * the menu at the top level, where only one is ever open.
 *
 * The name is passed in whole because the German test opens the same menu by
 * its German name.
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
 * Assert an action is nowhere on this screen: not inline, and not behind a
 * shut menu.
 *
 * An action inside a dropdown is not in the DOM until the menu opens, so a
 * page-wide query for it is null whatever the permissions. The check that no
 * trigger exists is what gives the absence meaning, and it only works for a
 * reader whose whole action list is inline (RowActions draws no trigger for
 * fewer than two menu items). Where a trigger exists, open it and query
 * within the menu instead.
 */
function expectNoSuchAction(name: RegExp): void {
  // queryAllByRole: a lost gate brings back one control per card, and the
  // singular query would throw "found multiple elements" instead of failing
  // on the count.
  expect(screen.queryAllByRole("link", { name })).toHaveLength(0);
  expect(screen.queryAllByRole("button", { name })).toHaveLength(0);
  expect(overflowTriggers()).toHaveLength(0);
}

async function renderPlanning(
  as:
    | "demo.player"
    | "demo.direction"
    | "demo.committee"
    | "demo.registeronly"
    | "demo.unplaced" = "demo.player",
  locale: Locale = "fr",
) {
  setMockUser(as);
  const result = await renderWithSession(<Events />, { route: "/events", locale });
  await screen.findAllByTestId("event-card");
  return result;
}

/** The cards of the top block. */
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
 * Switch the list between its two halves. The control is a Radix radiogroup
 * (`ui/radio-group.tsx`), so it is queried as a radio, not a button.
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
 * The view survives a second press. A radio group has no cleared state, and
 * this proves at screen level that the property reaches the reader.
 * ui/radio-group.test.tsx pins the primitive half.
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

test("a card shows its tags to a player too", async () => {
  await renderPlanning();
  const card = cardFor("Vendanges Cheyres");
  expect(within(within(card).getByTestId("event-meta")).getByText("Sortie")).toBeInTheDocument();
});

test("choosing a tag narrows the planning to it, and 'Tous' brings the rest back", async () => {
  const user = userEvent.setup();
  await renderPlanning();
  const before = screen.getAllByTestId("event-card").length;

  await user.click(screen.getByRole("radio", { name: "Sortie" }));
  await waitFor(() =>
    expect(screen.getAllByTestId("event-title").map((title) => title.textContent)).toEqual([
      "Vendanges Cheyres",
    ]),
  );

  await user.click(screen.getByRole("radio", { name: "Tous" }));
  await waitFor(() => expect(screen.getAllByTestId("event-card")).toHaveLength(before));
});

test("a tag nothing carries says so, and is not an empty planning", async () => {
  const user = userEvent.setup();
  server.use(
    http.get("/api/v1/event-tags", () =>
      HttpResponse.json({
        data: [{ id: 9, labelFr: "Souper", labelDe: null, colour: "coral", eventCount: 0 }],
        meta: { total: 1, limit: 500, offset: 0 },
      }),
    ),
  );
  await renderPlanning("demo.direction");

  await user.click(screen.getByRole("radio", { name: "Souper" }));

  expect(await screen.findByText("Aucun événement dans cette catégorie.")).toBeInTheDocument();
  expect(screen.queryByText("Aucun événement au planning.")).toBeNull();
  expect(screen.queryByText(/générez toute une saison/)).toBeNull();
});

test("the tag editor is not linked from the planning", async () => {
  // It is reached from the menu, like every other committee screen.
  // Layout.test.tsx pins who sees that entry.
  await renderPlanning("demo.direction");
  await screen.findAllByTestId("event-card");
  expect(
    screen.queryAllByRole("link").filter((link) => link.getAttribute("href") === "/event-tags"),
  ).toEqual([]);
});

test("no tag filter is offered when the band has no tags", async () => {
  server.use(
    http.get("/api/v1/event-tags", () =>
      HttpResponse.json({ data: [], meta: { total: 0, limit: 500, offset: 0 } }),
    ),
  );
  await renderPlanning();
  expect(screen.queryByRole("radiogroup", { name: "Filtrer par catégorie" })).toBeNull();
});

test("a player is offered no way to create an event", async () => {
  // Absent, not refused: a control that leads to "Accès refusé" reads as a
  // broken site. Both create links sit in a dropdown, so the trigger's absence
  // is the assertion (see expectNoSuchAction and docs/traps.md).
  await renderPlanning("demo.player");

  expectNoSuchAction(/Ajouter/);
});

test("an organiser gets both ways to create, behind one trigger", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  // One control on the heading's line, with the two destinations inside it.
  const trigger = screen.getByRole("button", { name: "Ajouter au planning" });
  expect(trigger).toHaveAttribute("aria-haspopup", "menu");

  await user.click(trigger);

  const menu = await screen.findByRole("menu");
  // Real anchors, not a useNavigate call, so middle-click and open-in-new-tab
  // work. asChild goes straight to Link: see RowActions' ItemFor for why a
  // second Slot layer drops the props.
  expect(within(menu).getByRole("menuitem", { name: "Ajouter un événement" })).toHaveAttribute(
    "href",
    "/events/new",
  );
  expect(within(menu).getByRole("menuitem", { name: "Ajouter une série" })).toHaveAttribute(
    "href",
    "/events/new/series",
  );
});

test("the past replaces the planning instead of extending it", async () => {
  const user = userEvent.setup();
  await renderPlanning();

  // The seeded mock has six upcoming and one past, so a toggle that appended
  // would show seven.
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
  // A blank screen reads as broken, and this is what a committee sees before
  // entering the season.
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
 * The empty message and the planned section are siblings, so an empty past
 * must not get a labelled, empty "Événements passés" under the message. The
 * seeded mock always carries one past event, so the override removes it.
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

  // The name is what makes the dialog worth stopping for.
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName(expect.stringContaining(title));
});

test("the dialog names what goes with the event, not only the event", async () => {
  // The API deletes every attendance answer and public registration attached
  // to the event, so the confirmation names both.
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

  // A player gets no actions and so no trigger. The trigger's absence is what
  // fails if the permission gate goes.
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

  await expect.poll(() => screen.getAllByTestId("event-card").length).toBe(before - 1);
});

test("a delete carries the tag of the read it was confirmed from", async () => {
  // DELETE is a conditional write (ADR 0013): refused 428 without an If-Match
  // and 412 with a stale one. The planning hands out no per-row tag, so
  // opening the dialog is also the read.
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
  // The dialog belongs to the screen, not to the menu item's subtree: a menu
  // unmounts everything it rendered as it closes, so a ConfirmByTypingName
  // inside DropdownMenuContent never appears.
  //
  // Mutation test: render the dialog as a child of DropdownMenuContent and
  // findByRole("alertdialog") below times out.
  //
  // The event dialog has no field to type into (`confirmPhrase` is unset), so
  // the confirmation going through with the menu gone stands in for focus and
  // pointer reaching the dialog.
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
  // #95: the top block is a snapshot of what was owed when the screen was
  // built, so answering changes the card and moves nothing, and the next
  // event's buttons never arrive under the finger.
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
  // The two blocks are different parents, so a card moving between them would
  // be remounted, losing focus and sending a screen reader back to the top.
  //
  // Mutation test: partition on `myAttendance` alone in Events and this
  // fails, because the button this holds is no longer in the document.
  await renderPlanning();

  const button = owedButton("Je viens à Vendanges Cheyres");
  await userEvent.click(button);

  await expect.poll(() => button.getAttribute("aria-pressed")).toBe("true");
  expect(button).toHaveFocus();
});

test("a card answered in place says so, under a heading that says what is left", async () => {
  // The marker and the count explain why an answered card still sits under
  // "À répondre".
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
  // moves.
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
  // The screen moves before the network does, so a tap on a bad connection is
  // never a button that does nothing for two seconds. The handler is held
  // open, so every assertion below runs while the request is in flight.
  //
  // Mutation test: move the `patchMyAttendance` call in AttendanceControls
  // below its `await record.mutateAsync` and this fails.
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
  // cache while the next test tears the tree down. The toast goes to a Toaster
  // this test does not render (Layout owns it), so the handler says when the
  // round trip is over.
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
  // Mutation test: delete `armed` from WithdrawDialog and the first assertion
  // fails, because the button becomes pressable with an empty field.
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
  // The client-side guard above only spares a round trip; the server enforces
  // the rule. translateApiError renders it against `fields.note`, which is why
  // `note` needs French copy in web/src/i18n/fr.ts (ApiErrorVocabularyTest).
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

test("a register without attendance.respond is asked nothing", async () => {
  // `myAttendance` is null on every event for somebody who does not answer,
  // so a naive split would file everything under "À répondre" with no way to
  // answer (the API refuses with 403 not_answerable). Rita plays in Cloches,
  // so a screen deciding from the register would ask her.
  await renderPlanning("demo.registeronly");

  expect(screen.queryByRole("region", { name: "À répondre" })).toBeNull();
  expect(screen.queryAllByTestId("attendance-controls")).toHaveLength(0);
});

test("attendance.respond without a register is asked to answer", async () => {
  // The other half of the same rule: Ulysse holds musician and plays in no
  // register, and the permission alone is what puts the planning to him.
  await renderPlanning("demo.unplaced");

  expect(screen.getByRole("region", { name: "À répondre" })).toBeInTheDocument();
  expect(screen.getAllByTestId("attendance-controls").length).toBeGreaterThan(0);
});

/* -------------------------------------------------------------------------- *
 * The calendar
 * -------------------------------------------------------------------------- */

test("the calendar is absent unless the server turns it on", async () => {
  // The flag comes from GET /api/v1/config because every environment runs the
  // same bundle. This proves the SPA obeys it.
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
  // Still on the planning: the calendar is an overview, not a second way in.
  expect(screen.getByRole("heading", { name: "Planning" })).toBeInTheDocument();
});

test("a narrowed planning says so at every width, and can be widened again", async () => {
  // The calendar is hidden below md, so a resize can take away the only
  // control that set the filter.
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
 * The weekly action stays a plain link on the page, never a tap into a menu.
 * Every other test touching "Qui vient" proves an absence; this proves the
 * presence.
 *
 * Mutation test: drop `inlineKey="attendance"` from Events.tsx's `RowActions`
 * call (or reorder `actions` so attendance is no longer first) and this
 * fails, because the link moves inside the "...".
 */
test("Qui vient stays a plain link, never behind the menu", async () => {
  await renderPlanning("demo.direction");

  const souper = cardFor("Souper de soutien");

  // No menu was opened, so a portalled Radix `menuitem` cannot satisfy this
  // by accident.
  expect(
    within(souper).getByRole("link", { name: "Qui vient à Souper de soutien" }),
  ).toHaveAttribute("href", "/events/7/attendance");
});

/**
 * Mutation test: drop `event.takesRegistrations` from the condition and this
 * fails.
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

  // Shut and waited for before opening the next one: `openMenuFor` is a bare
  // `findByRole`, which would resolve against a menu still mid-teardown.
  await user.keyboard("{Escape}");
  await expect.poll(() => screen.queryByRole("menu")).toBeNull();

  // Asserted from inside the open menu: an organiser has a trigger on a
  // rehearsal, so a page-wide query would be null whether the gate held or
  // not.
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
 * The options editor, unlike the guest list, belongs on every card: an event
 * that takes no bookings yet is when the committee fills it in.
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

  // Waited for: see "offers the guest list only on an event that takes
  // bookings".
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
 * Of these screens, `committee` holds only `registrations.view`: the guest
 * list, and no event form, chase list or options editor.
 */
test("a guest-list reader gets that link and no other", async () => {
  await renderPlanning("demo.committee");

  // One action, so no menu: RowActions draws no trigger for fewer than two
  // items behind it, and the guest list stays a plain link.
  expect(
    screen.getByRole("link", { name: "Inscriptions à Souper de soutien" }),
  ).toBeInTheDocument();

  // The trigger's absence is the assertion, since a shut menu holds nothing.
  expectNoSuchAction(/^Ce qui peut être réservé/);
  expectNoSuchAction(/^Modifier/);

  // A page-wide query is enough here: this action is the inline one, so it is
  // in the DOM whenever it exists.
  expect(screen.queryAllByRole("link", { name: /^Qui vient/ })).toHaveLength(0);
});

test("a player is told nothing about answers or bookings", async () => {
  // Mirrors EventCountsTest::test_a_player_is_told_nothing_about_answers at
  // the UI layer. The API has already withheld the numbers; this asserts the
  // screen does not invent them.
  await renderPlanning("demo.player");
  // The strip may show for the tags everybody sees, but carries no count.
  for (const strip of screen.queryAllByTestId("event-meta")) {
    expect(strip.textContent).not.toMatch(/réponse|personne|inscription|Public/);
  }
});

test("an organiser sees the public chip and the answer fraction", async () => {
  await renderPlanning("demo.direction");
  const strips = screen.getAllByTestId("event-meta");
  expect(strips.length).toBeGreaterThan(0);
  expect(screen.getAllByText(/réponses$/).length).toBeGreaterThan(0);

  // Pinned to specific cards rather than counted: a count of "Public" chips
  // breaks when another public event is seeded, and passes with the chip on
  // the wrong card.
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

  // Pinned to specific cards for the same reason as the public chip above.
  // By title, since a rehearsal's "Répétition" tag chip carries the same text.
  const souper = cardFor("Souper de soutien");
  const rehearsal = cardFor("Répétition");

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
  await renderPlanning("demo.player", "de-CH");

  const rest = screen.getByRole("region", { name: "Die übrige Planung" });
  await userEvent.click(within(rest).getByRole("button", { name: /^Ich komme nicht zu/ }));

  const dialog = await screen.findByRole("alertdialog");

  // Tight guillemets and no space before the "?", both of which French takes
  // and German does not, so the whole sentence is one catalogue string.
  expect(dialog).toHaveTextContent("Sie kommen nicht mehr zu «Répétition»?");

  const confirm = within(dialog).getByRole("button", { name: "Ich komme nicht" });
  expect(confirm).toHaveAttribute("aria-disabled", "true");

  // Abbrechen here, Rückgängig in the toast: one French word, "Annuler", for
  // two German ones, so common.cancel and attendance.undo stay two keys.
  // AttendanceUndo.test.tsx pins the other half.
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
 * The planning in German
 * -------------------------------------------------------------------------- */

test("the planning reads in German, card labels included", async () => {
  await renderPlanning("demo.player", "de-CH");

  expect(screen.getByRole("heading", { level: 1, name: "Planung" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Zu beantworten" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Die übrige Planung" })).toBeInTheDocument();
  expect(screen.getByRole("radiogroup", { name: "Ansicht der Planung" })).toBeInTheDocument();
  expect(screen.getByRole("radio", { name: "Vergangene Anlässe" })).toBeInTheDocument();

  // No space before the colon, where French takes a no-break one.
  const card = screen.getAllByTestId("event-card")[0] as HTMLElement;
  expect(card).toHaveTextContent("Ort:");
  expect(card).toHaveTextContent("Kleidung:");
});

test("the owed count changes its verb in German, so the plural is in the catalogue", async () => {
  // German conjugates: "Es fehlt noch 1 Rückmeldung" against "Es fehlen noch
  // 2 Rückmeldungen", while French says "Il reste" for both.
  //
  // Mutation test: merge events.owedCount_one into _other and the singular
  // assertion below reads "Es fehlen noch 1 Rückmeldung.", which no French
  // test could see.
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

  // The label is read from the menu item that renders it, so the two cannot
  // drift, and the guillemets are tight where French spaces them. The item
  // sits behind the "Hinzufügen" trigger, so the menu is opened first.
  await user.click(screen.getByRole("button", { name: "Hinzufügen zur Planung" }));
  const action = await screen.findByRole("menuitem", { name: "Serie hinzufügen" });
  expect(screen.getByText(/gleich eine ganze Saison/)).toHaveTextContent(
    `mit «${action.textContent}» gleich eine ganze Saison`,
  );
});

test("the calendar's month and weekday names follow the locale", async () => {
  // EventCalendar.tsx formats month and weekday names at render time, since
  // a module-scope formatter is built at import, before any locale exists.
  //
  // Mutation test: hoist a formatter or the weekday list to module scope and
  // this fails, because the French tests above import the same module first.
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

  // catalogues.test.ts proves both files hold the same keys but cannot see
  // French pasted into de.ts, so the trigger and one item are read here by
  // their German accessible names.
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
 * Searching
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
  // The "add a series" hint is for an empty planning only.
  expect(screen.queryByText("Aucun événement au planning.")).not.toBeInTheDocument();
  expect(screen.queryByText(/générez toute une saison/)).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Effacer la recherche" }));

  // Six published upcoming events and the two seeded drafts.
  await waitFor(() => expect(titlesOnScreen()).toHaveLength(8));
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

/* -------------------------------------------------------------------------- *
 * Drafts
 * -------------------------------------------------------------------------- */

function draftsRegion(): HTMLElement {
  return screen.getByRole("region", { name: "Brouillons" });
}

test("a manager's drafts sit in their own group above the dated planning, undated first", async () => {
  await renderPlanning("demo.direction");

  const titles = within(draftsRegion())
    .getAllByTestId("event-title")
    .map((title) => title.textContent);
  expect(titles).toEqual(["Sortie de fin de saison", "Concert d'automne"]);

  // Above the rest of the planning.
  const firstPlanned = cardFor("Répétition + apéritif de Noël");
  expect(
    draftsRegion().compareDocumentPosition(firstPlanned) & Node.DOCUMENT_POSITION_FOLLOWING,
  ).toBeTruthy();
});

test("a player's planning has no drafts group and none of its events", async () => {
  await renderPlanning("demo.player");

  expect(screen.queryByRole("region", { name: "Brouillons" })).not.toBeInTheDocument();
  const titles = screen.getAllByTestId("event-title").map((title) => title.textContent);
  expect(titles).not.toContain("Concert d'automne");
  expect(titles).not.toContain("Sortie de fin de saison");
});

test("a draft says what it is missing rather than leaving it blank", async () => {
  await renderPlanning("demo.direction");

  const card = within(draftsRegion()).getAllByTestId("event-card")[0] as HTMLElement;
  expect(within(card).getByTestId("draft-badge")).toHaveTextContent("Brouillon");
  expect(within(card).getByTestId("event-when")).toHaveTextContent("Date à fixer");
  expect(within(card).getByTestId("event-location")).toHaveTextContent("Lieu à fixer");
});

test("a draft is not offered the chase list, which has nobody to chase yet", async () => {
  await renderPlanning("demo.direction");

  const card = cardFor("Concert d'automne");
  expect(within(card).queryByRole("link", { name: /Qui vient/ })).not.toBeInTheDocument();
});

test("publishing an incomplete draft names the fields it is missing", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  await user.click(
    within(cardFor("Sortie de fin de saison")).getByRole("button", {
      name: "Publier Sortie de fin de saison",
    }),
  );

  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Complétez ou corrigez les champs avant de publier.");
  expect(alert).toHaveTextContent("Début est obligatoire");
  expect(alert).toHaveTextContent("Fin est obligatoire");
  expect(alert).toHaveTextContent("Lieu est obligatoire");

  // Nothing moved: it is still a draft.
  expect(within(draftsRegion()).getAllByTestId("event-card")).toHaveLength(2);
});

test("publishing a complete draft takes it out of the drafts group", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  await user.click(
    within(cardFor("Concert d'automne")).getByRole("button", {
      name: "Publier Concert d'automne",
    }),
  );

  await waitFor(() => expect(within(draftsRegion()).getAllByTestId("event-card")).toHaveLength(1));
  // Still on the planning, now among the dated events.
  expect(cardFor("Concert d'automne")).toBeInTheDocument();
  expect(within(cardFor("Concert d'automne")).queryByTestId("draft-badge")).not.toBeInTheDocument();
});

test("a published event with no answers can go back to draft, from the menu", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  const menu = await openMenuFor(
    user,
    cardFor("Répétition + apéritif de Noël"),
    "Autres actions pour Répétition + apéritif de Noël",
  );
  await user.click(
    within(menu).getByRole("menuitem", {
      name: "Repasser Répétition + apéritif de Noël en brouillon",
    }),
  );

  await waitFor(() => expect(within(draftsRegion()).getAllByTestId("event-card")).toHaveLength(3));
});

test("an event that has answers refuses to go back to draft, and says why", async () => {
  const user = userEvent.setup();
  await renderPlanning("demo.direction");

  // The first Répétition is the one the seed gives three answers to.
  const first = screen
    .getAllByTestId("event-card")
    .find(
      (card) => within(card).getByTestId("event-title").textContent === "Répétition",
    ) as HTMLElement;
  const menu = await openMenuFor(user, first, "Autres actions pour Répétition");
  await user.click(
    within(menu).getByRole("menuitem", { name: "Repasser Répétition en brouillon" }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Des réponses ou des inscriptions existent déjà",
  );
});

test("the drafts group is German in German", async () => {
  await renderPlanning("demo.direction", "de-CH");

  const region = screen.getByRole("region", { name: "Entwürfe" });
  expect(within(region).getAllByTestId("draft-badge")[0]).toHaveTextContent("Entwurf");
  expect(within(region).getAllByTestId("event-when")[0]).toHaveTextContent("Datum noch offen");
});

test("a draft shows no answer count, because nobody can answer it yet", async () => {
  await renderPlanning("demo.direction");

  expect(within(draftsRegion()).queryByText(/réponses/)).not.toBeInTheDocument();
  // While a published card still carries its fraction.
  expect(
    within(cardFor("Répétition + apéritif de Noël")).getByText(/réponses/),
  ).toBeInTheDocument();
});
