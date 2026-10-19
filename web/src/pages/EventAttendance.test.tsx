import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { memberAttendanceUpdate } from "../api/generated/endpoints";
import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { EventAttendance } from "./EventAttendance";

/**
 * Rendered behind a matching Route: outside one `useParams` returns nothing
 * and the screen reads event NaN.
 *
 * This bare route tree also exempts `demo.both` from the forced password
 * change. That fixture carries `mustChangePassword: true` (see
 * web/src/mocks/handlers.ts), and MustChangePassword is wired in routes.tsx,
 * so here the gate has no ancestor. Through the real route table that actor
 * redirects to /account instead.
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
 * The one answer card for this person, found by the name it contains: the
 * card fuses name, answer and reason into one sentence (`answerLine`).
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
  // The chase comes first in the DOM.
  expect(silent.compareDocumentPosition(answers)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
});

test("a withdrawal is shown with its reason beside the name", async () => {
  // A name, an answer and the reason for it, in one sentence.
  await renderChaseList();

  expect(cardFor("Camille Committee")).toHaveTextContent("Camille Committee — non — « Malade »");
});

test("an answer the committee entered says so", async () => {
  await renderChaseList();

  expect(cardFor("Nadia Sansconnexion")).toHaveTextContent("Saisie par le comité.");
});

test("an answer card names the pupitre it belongs to", async () => {
  // Labelled, since "Trompettes" alone under a name does not say what it is.
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
  // Bastien plays and holds attendance.record_for_others. The on-behalf
  // endpoint answers him 409 cannot_record_for_self, because that route is
  // exempt from the reason a withdrawal costs, and aiming it at yourself would
  // walk around that reason.
  //
  // Mutation test: drop the `entry.memberId === user?.id` branch in
  // EventAttendance and the first assertion fails.
  await renderChaseList("demo.both");

  const silent = screen.getByRole("region", { name: "Sans réponse" });
  const row = within(silent)
    .getByText(/Bastien Both/)
    .closest("li") as HTMLElement;

  expect(within(row).queryByRole("button", { name: "Bastien Both vient" })).toBeNull();
  expect(within(row).queryByRole("button", { name: "Bastien Both ne vient pas" })).toBeNull();
  expect(within(row).getByText("Répondez depuis le planning.")).toBeInTheDocument();
});

test("an answer already recorded can be changed", async () => {
  // "Non, malade", then a phone call to say they can come after all.
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

  // The reason goes with the answer it was given for.
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
  // Pre-filled with what is stored, or saving would silently erase the other
  // half.
  const reason = within(dialog).getByLabelText("Raison");
  expect(reason).toHaveValue("Malade");

  await userEvent.clear(reason);
  await userEvent.type(reason, "Grippe");
  await userEvent.click(within(dialog).getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => cardFor("Camille Committee").textContent).toContain("Grippe");

  expect(cardFor("Camille Committee")).toHaveTextContent("Camille Committee — non");
});

test("the correction is offered once, not once per layout", async () => {
  // One layout only: a second one would double this count first.
  await renderChaseList();

  expect(
    screen.getAllByRole("button", { name: "Corriger la réponse de Camille Committee" }),
  ).toHaveLength(1);
});

test("the correction is absent from the caller's own answered row", async () => {
  // Once Bastien has an answer his row appears among the Réponses, where a
  // correction control would 409 as well. The direction records that answer
  // first, because he cannot record it for himself.
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
  // The punctuation assertions matter most: French typography composed in a
  // component is what breaks on a German page.
  await renderChaseList("demo.direction", "de-CH");

  expect(screen.getByRole("heading", { name: "Wer kommt?" })).toBeInTheDocument();
  expect(screen.getByTestId("chase-counts")).toHaveTextContent(
    "2 Ja · 1 Nein · 1 ohne Rückmeldung",
  );
  expect(screen.getByRole("region", { name: "Ohne Rückmeldung" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Rückmeldungen" })).toBeInTheDocument();

  const card = cardFor("Camille Committee");

  // Tight guillemets, where French spaces them. The answer is "Nein",
  // capitalised: lowercasing it is French grammar.
  expect(card).toHaveTextContent("Camille Committee — Nein — «Malade»");

  // No space before the colon, where French takes a no-break one.
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
  // The dialog's title is the button's accessible name, so it confirms what
  // was clicked.
  expect(
    within(dialog).getByText("Rückmeldung von Camille Committee korrigieren"),
  ).toBeInTheDocument();
  expect(within(dialog).getByLabelText("Begründung")).toHaveValue("Malade");

  // Abbrechen, not Rückgängig: both are "Annuler" in French, and this one
  // closes a dialog without doing anything. AttendanceUndo.test.tsx pins the
  // toast's undo.
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
