import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { beforeEach, expect, test, vi } from "vitest";

import { celebrate } from "../carnival/celebrate";
import { problem, setMockTagCelebrates, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { Events } from "../pages/Events";
import { renderWithSession } from "../test/renderWithSession";

vi.mock("../carnival/celebrate", () => ({ celebrate: vi.fn() }));

/** "Sortie", the tag Vendanges Cheyres carries in the mock planning. */
const SORTIE = 3;

beforeEach(() => {
  vi.mocked(celebrate).mockClear();
});

async function renderPlanning() {
  setMockUser("demo.player");
  await renderWithSession(<Events />, { route: "/events" });
  await screen.findAllByTestId("event-card");
}

function button(name: string): HTMLElement {
  return within(screen.getByRole("region", { name: "À répondre" })).getByRole("button", { name });
}

async function answerYes(title: string) {
  await userEvent.click(button(`Je viens à ${title}`));
  await expect.poll(() => button(`Je viens à ${title}`).getAttribute("aria-pressed")).toBe("true");
}

test("a first Oui to an event whose tag celebrates throws confetti once", async () => {
  // MUTATION TEST: drop the tag check in AttendanceControls and the next test
  // fails; drop the call and this one does.
  setMockTagCelebrates(SORTIE, true);
  await renderPlanning();

  await answerYes("Vendanges Cheyres");

  await expect.poll(() => vi.mocked(celebrate).mock.calls.length).toBe(1);
});

test("an Oui to an event with no celebrating tag throws nothing", async () => {
  await renderPlanning();

  await answerYes("Vendanges Cheyres");

  expect(celebrate).not.toHaveBeenCalled();
});

test("changing Non to Oui celebrates, and a second Oui does not", async () => {
  setMockTagCelebrates(SORTIE, true);
  await renderPlanning();

  await userEvent.click(button("Je ne viens pas à Vendanges Cheyres"));
  await expect
    .poll(() => button("Je ne viens pas à Vendanges Cheyres").getAttribute("aria-pressed"))
    .toBe("true");
  expect(celebrate).not.toHaveBeenCalled();

  await answerYes("Vendanges Cheyres");
  await expect.poll(() => vi.mocked(celebrate).mock.calls.length).toBe(1);

  // Already Oui: the tap re-sends the same answer, which is nothing new.
  await userEvent.click(button("Je viens à Vendanges Cheyres"));
  await screen.findAllByTestId("event-card");
  expect(celebrate).toHaveBeenCalledTimes(1);
});

test("an Oui the server refuses throws nothing", async () => {
  setMockTagCelebrates(SORTIE, true);
  server.use(
    http.put("/api/v1/events/:id/attendance", () =>
      problem(409, "answer_already_settled", "Conflict"),
    ),
  );
  await renderPlanning();

  await userEvent.click(button("Je viens à Vendanges Cheyres"));
  await expect
    .poll(() => button("Je viens à Vendanges Cheyres").getAttribute("aria-pressed"))
    .toBe("false");

  expect(celebrate).not.toHaveBeenCalled();
});
