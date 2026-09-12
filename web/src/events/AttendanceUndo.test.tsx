import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { Toaster } from "../components/ui/sonner";
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
async function renderPlanning() {
  setMockUser("demo.player");
  const result = await renderWithSession(
    <>
      <Events />
      <Toaster />
    </>,
    { route: "/events" },
  );
  await screen.findAllByTestId("event-card");
  return result;
}

/** How many events are still waiting on an answer. */
function awaitingCount(): number {
  return within(screen.getByRole("region", { name: "À répondre" })).getAllByTestId("event-card")
    .length;
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

  const awaiting = screen.getByRole("region", { name: "À répondre" });
  await userEvent.click(
    within(awaiting).getByRole("button", { name: "Je viens à Vendanges Cheyres" }),
  );

  // Four of the five upcoming events were unanswered; answering one leaves
  // three.
  await expect.poll(() => awaitingCount()).toBe(3);

  const toast = await toastSaying("Vous venez.");
  await userEvent.click(within(toast).getByRole("button", { name: "Annuler" }));

  // Back to UNANSWERED rather than to the opposite answer — the state a second
  // PUT cannot express, and the whole reason DELETE exists at all.
  await expect.poll(() => awaitingCount()).toBe(4);
  expect(
    within(screen.getByRole("region", { name: "À répondre" })).getByRole("button", {
      name: "Je viens à Vendanges Cheyres",
    }),
  ).toHaveAttribute("aria-pressed", "false");
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
  const toast = await toastSaying("Vous ne venez pas.");
  expect(within(toast).queryByRole("button", { name: "Annuler" })).toBeNull();
});
