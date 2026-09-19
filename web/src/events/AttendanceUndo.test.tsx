import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { Toaster } from "../components/ui/sonner";
import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { Events } from "../pages/Events";
import { renderWithSession } from "../test/renderWithSession";

/**
 * The undo, which lives in a toast and therefore needs the Toaster the layout
 * normally mounts.
 *
 * ITS OWN FILE, because sonner keeps its toasts in MODULE STATE that no render
 * resets. Every other test that answers an event queues a toast nothing draws;
 * mount a Toaster in the same file afterwards and they all arrive at once, and
 * a query for "Annuler" finds four of them. Here only these two tests raise
 * one, and each assertion is still scoped to the toast carrying its own text
 * rather than to the page.
 */
async function renderPlanning(locale: Locale = "fr") {
  setMockUser("demo.player");
  const result = await renderWithSession(
    <>
      <Events />
      <Toaster />
    </>,
    { route: "/events", locale },
  );
  await screen.findAllByTestId("event-card");
  return result;
}

/** The answer button for an event, inside the block that holds it (#95). */
function owedButton(name: string): HTMLElement {
  return within(screen.getByRole("region", { name: "À répondre" })).getByRole("button", { name });
}

/** The toast carrying this sentence, so a leftover one is never the match. */
async function toastSaying(sentence: string): Promise<HTMLElement> {
  const line = await screen.findByText(sentence);
  const toast = line.closest("[data-sonner-toast]");
  if (!(toast instanceof HTMLElement)) {
    throw new Error(`"${sentence}" was rendered outside a toast`);
  }
  return toast;
}

test("a first answer can be taken back from the toast", async () => {
  await renderPlanning();

  await userEvent.click(owedButton("Je viens à Vendanges Cheyres"));
  await expect
    .poll(() => owedButton("Je viens à Vendanges Cheyres").getAttribute("aria-pressed"))
    .toBe("true");

  // Named, so somebody who tapped the wrong card can see that they did — the
  // undo beside it is only usable by a reader who knows they need it.
  const toast = await toastSaying("Vous venez — Vendanges Cheyres.");
  await userEvent.click(within(toast).getByRole("button", { name: "Annuler" }));

  // Back to UNANSWERED rather than to the opposite answer — the state a second
  // PUT cannot express, and the whole reason DELETE exists at all. It happens
  // WHERE THE CARD ALREADY IS (#95): the undo is offered from a toast at the
  // bottom of the screen, so a card flying back up into a block the reader is
  // no longer looking at said nothing to anybody.
  await expect
    .poll(() => owedButton("Je viens à Vendanges Cheyres").getAttribute("aria-pressed"))
    .toBe("false");
  expect(screen.queryByTestId("answered-in-place")).toBeNull();
  expect(screen.getByTestId("owed-count")).toHaveTextContent("Il reste 5 événements sans réponse.");
});

test("a change offers no undo, because undo would erase the answer it changed", async () => {
  // MUTATION TEST: make the toast's action unconditional and this fails. The
  // only thing behind undo is DELETE, which returns the event to UNANSWERED —
  // so on a withdrawal it would throw away the `oui` and the reason C11 just
  // collected for it, in one tap, and record neither.
  await renderPlanning();

  const rest = screen.getByRole("region", { name: "Le reste du planning" });
  await userEvent.click(within(rest).getByRole("button", { name: /^Je ne viens pas à/ }));

  const dialog = await screen.findByRole("alertdialog");
  await userEvent.type(within(dialog).getByLabelText("Raison"), "Malade");
  await userEvent.click(within(dialog).getByRole("button", { name: "Je ne viens pas" }));

  // The toast still arrives. It just carries no way out.
  const toast = await toastSaying("Vous ne venez pas — Répétition.");
  expect(within(toast).queryByRole("button", { name: "Annuler" })).toBeNull();
});

test("the German toast offers Rückgängig, which is not the dialog's Abbrechen", async () => {
  // The page around the control is still French (#154), so the block is still
  // queried by its French name. The control, the toast and the undo are this
  // slice's.
  await renderPlanning("de-CH");

  await userEvent.click(owedButton("Ich komme zu Vendanges Cheyres"));

  const toast = await toastSaying("Sie kommen — Vendanges Cheyres.");

  // THE HALF THE DIALOG TEST CANNOT SEE. French calls both of these "Annuler":
  // this one takes an answer back, and the dialog's closes without doing
  // anything. Merging them into one catalogue key renders correctly in French
  // and wrongly in German, which is why there are two — and why each is
  // asserted where it lives, with the other one asserted absent.
  expect(within(toast).queryByRole("button", { name: "Abbrechen" })).toBeNull();
  await userEvent.click(within(toast).getByRole("button", { name: "Rückgängig" }));

  await expect
    .poll(() => owedButton("Ich komme zu Vendanges Cheyres").getAttribute("aria-pressed"))
    .toBe("false");
});
