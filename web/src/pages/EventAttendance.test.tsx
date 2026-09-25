import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";

import { memberAttendanceUpdate } from "../api/generated/endpoints";
import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { EventAttendance } from "./EventAttendance";

/**
 * The chase list is reached through a route parameter, so it has to be
 * rendered behind one — `useParams` returns nothing at all for a component
 * mounted outside a matching Route, and the screen then reads event NaN.
 *
 * THIS BARE ROUTE TREE IS ALSO WHAT EXEMPTS `demo.both` FROM THE FORCED
 * PASSWORD CHANGE. That fixture carries `mustChangePassword: true` (it is the
 * roster's provisional-password case — see web/src/mocks/handlers.ts), and
 * MustChangePassword is wired in routes.tsx, not here, so the gate has no
 * ancestor to fire from. Route this screen through the real table and that
 * actor starts redirecting to /account instead.
 */
async function renderChaseList(
  as: "demo.direction" | "demo.both" = "demo.direction",
  locale: Locale = "fr",
) {
  setMockUser(as);
  const result = await renderWithSession(
    <Routes>
      <Route path="/events/:id/attendance" element={<EventAttendance />} />
    </Routes>,
    { route: "/events/1/attendance", locale },
  );
  await screen.findByTestId("chase-counts");
  return result;
}

/**
 * The one answer card for this person.
 *
 * There was a table beside these cards until #130, both layouts in the DOM at
 * once, and every query in this file had to say which it meant. The card fuses
 * name, answer and reason into one sentence on purpose — `answerLine` — so a
 * card is found by the name it contains rather than by a cell of its own.
 */
function cardFor(name: string) {
  const card = within(screen.getByTestId("chase-cards"))
    .getAllByRole("listitem")
    .find((candidate) => candidate.textContent?.includes(name));

  if (!card) {
    throw new Error(`no answer card for "${name}"`);
  }

  return card;
}

test("the counts lead with all three, including the one the screen exists for", async () => {
  // The seeded answers against event 1: two yes (one of them entered by the
  // committee), one no, and Bastien, who has said nothing.
  await renderChaseList();
  expect(screen.getByTestId("chase-counts")).toHaveTextContent("2 oui · 1 non · 1 sans réponse");
});

test("the people who have not answered come before the people who have", async () => {
  await renderChaseList();

  const silent = screen.getByRole("region", { name: "Sans réponse" });
  const answers = screen.getByRole("region", { name: "Réponses" });

  expect(within(silent).getByText(/Bastien Both/)).toBeInTheDocument();
  // The DOM order IS the argument of this screen: a report of who said yes is
  // what it must not be.
  expect(silent.compareDocumentPosition(answers)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

test("a withdrawal is shown with its reason beside the name", async () => {
  // What the direction should be able to read: a
  // name, an answer, and the reason for it, in one sentence — not a count that
  // dropped by one.
  await renderChaseList();

  expect(cardFor("Camille Committee")).toHaveTextContent("Camille Committee — non — « Malade »");
});

test("an answer the committee entered says so", async () => {
  await renderChaseList();

  expect(cardFor("Nadia Sansconnexion")).toHaveTextContent("Saisie par le comité.");
});

test("an answer card names the pupitre it belongs to", async () => {
  // LABELLED, not bare. The column head that used to carry this went with the
  // table (#130), so "Trompettes" alone under a name would be a word rather
  // than a fact.
  await renderChaseList();

  expect(cardFor("Camille Committee")).toHaveTextContent("Pupitre : Trombones");
});

test("the committee can answer for somebody who has not", async () => {
  await renderChaseList();

  const silent = screen.getByRole("region", { name: "Sans réponse" });
  await userEvent.click(within(silent).getByRole("button", { name: "Bastien Both vient" }));

  // Recorded, counted, and marked as the committee's entry rather than his.
  await expect
    .poll(() => screen.getByTestId("chase-counts").textContent)
    .toContain("0 sans réponse");

  expect(cardFor("Bastien Both")).toHaveTextContent("Saisie par le comité.");
});

test("the on-behalf controls are absent from the caller's own row", async () => {
  // Bastien plays AND holds attendance.record_for_others — the case the whole
  // rule exists for. The on-behalf endpoint answers him 409
  // cannot_record_for_self, because that route is exempt from the reason a
  // withdrawal costs, so aiming it at yourself walks around that reason.
  //
  // MUTATION TEST: drop the `entry.memberId === user?.id` branch in
  // EventAttendance and this fails on the first assertion — the buttons are
  // rendered for him like anybody else, and every tap 409s.
  await renderChaseList("demo.both");

  const silent = screen.getByRole("region", { name: "Sans réponse" });
  const row = within(silent)
    .getByText(/Bastien Both/)
    .closest("li") as HTMLElement;

  expect(within(row).queryByRole("button", { name: "Bastien Both vient" })).toBeNull();
  expect(within(row).queryByRole("button", { name: "Bastien Both ne vient pas" })).toBeNull();
  expect(within(row).getByText("Répondez depuis le planning.")).toBeInTheDocument();
});

test("the silent names are copied for WhatsApp, one per line", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });

  await renderChaseList();
  await userEvent.click(screen.getByRole("button", { name: "Copier pour WhatsApp" }));

  await expect.poll(() => writeText.mock.calls.length).toBe(1);
  expect(writeText).toHaveBeenCalledWith("Bastien Both");

  vi.unstubAllGlobals();
});

test("an answer already recorded can be changed", async () => {
  // The case the screen exists for and did not handle: "non, malade", then a
  // phone call to say they can come after all.
  await renderChaseList();

  await userEvent.click(
    within(cardFor("Camille Committee")).getByRole("button", {
      name: "Corriger la réponse de Camille Committee",
    }),
  );

  const dialog = await screen.findByRole("alertdialog");
  await userEvent.click(within(dialog).getByRole("button", { name: "Oui" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect
    .poll(() => screen.getByTestId("chase-counts").textContent)
    .toContain("3 oui · 0 non");

  // The reason went with the answer it was given for: "malade" against a
  // "oui" is worse than no reason at all.
  const corrected = cardFor("Camille Committee");
  expect(corrected).toHaveTextContent("Camille Committee — oui");
  expect(corrected).not.toHaveTextContent("Malade");
});

test("the reason can be corrected without touching the answer", async () => {
  await renderChaseList();

  await userEvent.click(
    within(cardFor("Camille Committee")).getByRole("button", {
      name: "Corriger la réponse de Camille Committee",
    }),
  );

  const dialog = await screen.findByRole("alertdialog");
  // PRE-FILLED with what is stored: a correction starts from the answer being
  // corrected, or saving it would silently erase the other half.
  const reason = within(dialog).getByLabelText("Raison");
  expect(reason).toHaveValue("Malade");

  await userEvent.clear(reason);
  await userEvent.type(reason, "Grippe");
  await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => cardFor("Camille Committee").textContent).toContain("Grippe");

  expect(cardFor("Camille Committee")).toHaveTextContent("Camille Committee — non");
});

test("the correction is offered once, not once per layout", async () => {
  // There were two of this button until #130 — one per layout — and a control
  // added to only one of them was invisible to whichever half of the band was
  // on the other. The count is what a second layout coming back changes first.
  await renderChaseList();

  expect(
    screen.getAllByRole("button", { name: "Corriger la réponse de Camille Committee" }),
  ).toHaveLength(1);
});

test("the correction is absent from the caller's own answered row", async () => {
  // Bastien plays AND holds the permission, so once he has an answer his own
  // row appears among the Réponses — where a correction control would 409
  // exactly as one in the Sans réponse block would. The direction records
  // that answer first, because he cannot record it for himself.
  setMockUser("demo.direction");
  await memberAttendanceUpdate(1, 3, { status: "yes" });

  await renderChaseList("demo.both");

  const card = cardFor("Bastien Both");

  expect(
    within(card).queryByRole("button", { name: "Corriger la réponse de Bastien Both" }),
  ).toBeNull();
  expect(within(card).getByText("Modifiable depuis le planning.")).toBeInTheDocument();
});

test("the whole chase list reads in German, punctuation included", async () => {
  // THE ASSERTIONS THAT MATTER HERE ARE THE PUNCTUATION ONES. Every word on
  // this screen was already in a catalogue after a mechanical extraction; what
  // a mechanical extraction leaves behind is the French typography the
  // components composed around it, and that is what breaks on a German page.
  await renderChaseList("demo.direction", "de-CH");

  expect(screen.getByRole("heading", { name: "Wer kommt?" })).toBeInTheDocument();
  expect(screen.getByTestId("chase-counts")).toHaveTextContent(
    "2 Ja · 1 Nein · 1 ohne Rückmeldung",
  );
  expect(screen.getByRole("region", { name: "Ohne Rückmeldung" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Rückmeldungen" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Für WhatsApp kopieren" })).toBeInTheDocument();

  const card = cardFor("Camille Committee");

  // TIGHT GUILLEMETS, «so». French sets them « comme ça », and that spacing
  // was hardcoded in chaseList.ts, so a German reader read a French sentence's
  // punctuation around their own words. The answer is "Nein", capitalised: it
  // was `answerLabel(status).toLowerCase()`, which is French grammar applied
  // to every locale at once.
  expect(card).toHaveTextContent("Camille Committee — Nein — «Malade»");

  // NO SPACE BEFORE THE COLON, where French takes a no-break one. Same class
  // of bug as the Tbd separator (#152), found the same way: by reading the
  // rendered page rather than the diff.
  expect(card).toHaveTextContent("Register: Trombones");

  expect(cardFor("Nadia Sansconnexion")).toHaveTextContent("Vom Vorstand erfasst.");
});

test("correcting an answer is German down to the dialog's buttons", async () => {
  await renderChaseList("demo.direction", "de-CH");

  await userEvent.click(
    within(cardFor("Camille Committee")).getByRole("button", {
      name: "Rückmeldung von Camille Committee korrigieren",
    }),
  );

  const dialog = await screen.findByRole("alertdialog");
  // The dialog's title IS the button's accessible name, so the dialog confirms
  // what was clicked instead of paraphrasing it.
  expect(
    within(dialog).getByText("Rückmeldung von Camille Committee korrigieren"),
  ).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Begründung")).toHaveValue("Malade");

  // ABBRECHEN, NOT RÜCKGÄNGIG. Both are "Annuler" in French, and this is the
  // one that closes a dialog without doing anything. The toast's undo is the
  // other word; AttendanceUndo.test.tsx pins that one.
  expect(within(dialog).getByRole("button", { name: "Abbrechen" })).toBeInTheDocument();

  await userEvent.click(within(dialog).getByRole("button", { name: "Ja" }));
  await userEvent.click(within(dialog).getByRole("button", { name: "Speichern" }));

  await expect
    .poll(() => screen.getByTestId("chase-counts").textContent)
    .toContain("3 Ja · 0 Nein");
});

test("the on-behalf refusal notice is German too", async () => {
  await renderChaseList("demo.both", "de-CH");

  const silent = screen.getByRole("region", { name: "Ohne Rückmeldung" });

  expect(within(silent).queryByRole("button", { name: "Bastien Both kommt" })).toBeNull();
  expect(within(silent).getByText("Antworten Sie über die Planung.")).toBeInTheDocument();
});
