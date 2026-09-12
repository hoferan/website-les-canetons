import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { expect, test, vi } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { EventAttendance } from "./EventAttendance";

/**
 * The chase list is reached through a route parameter, so it has to be
 * rendered behind one — `useParams` returns nothing at all for a component
 * mounted outside a matching Route, and the screen then reads event NaN.
 */
async function renderChaseList(as: "demo.direction" | "demo.both" = "demo.direction") {
  setMockUser(as);
  const result = await renderWithSession(
    <Routes>
      <Route path="/events/:id/attendance" element={<EventAttendance />} />
    </Routes>,
    { route: "/events/1/attendance" },
  );
  await screen.findByTestId("chase-counts");
  return result;
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
  await renderChaseList();

  // "Camille Committee — non — « Malade »", not a count that dropped by one.
  const table = screen.getByTestId("chase-table");
  const row = within(table).getByText("Camille Committee").closest("tr") as HTMLElement;

  expect(within(row).getByText("Non")).toBeInTheDocument();
  expect(within(row).getByText("Malade")).toBeInTheDocument();
});

test("an answer the committee entered says so", async () => {
  await renderChaseList();

  const table = screen.getByTestId("chase-table");
  const row = within(table).getByText("Nadia Sansconnexion").closest("tr") as HTMLElement;

  expect(within(row).getByText("(comité)")).toBeInTheDocument();
});

test("the committee can answer for somebody who has not", async () => {
  await renderChaseList();

  const silent = screen.getByRole("region", { name: "Sans réponse" });
  await userEvent.click(within(silent).getByRole("button", { name: "Bastien Both vient" }));

  // Recorded, counted, and marked as the committee's entry rather than his.
  await expect
    .poll(() => screen.getByTestId("chase-counts").textContent)
    .toContain("0 sans réponse");

  const row = within(screen.getByTestId("chase-table"))
    .getByText("Bastien Both")
    .closest("tr") as HTMLElement;
  expect(within(row).getByText("(comité)")).toBeInTheDocument();
});

test("the on-behalf controls are absent from the caller's own row (C14)", async () => {
  // Bastien plays AND holds attendance.record_for_others — the case the whole
  // rule exists for. The on-behalf endpoint answers him 409
  // cannot_record_for_self, because that route is exempt from the reason a
  // withdrawal costs, so aiming it at yourself walks around C11.
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
