import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import type { BookingReadResource } from "../api/generated/model";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { BookingReadLine } from "./BookingReadLine";

/** Read by Marie, then two bookings made and one cancelled, one by Paul. */
const READ: BookingReadResource = {
  readAt: "2026-11-08T09:05:00Z",
  readBy: "Marie Comité",
  latestChangeId: 12,
  changes: { new: 2, changed: 0, cancelled: 1 },
  newIds: [1, 2],
  changedIds: [],
  actors: ["Paul Direction"],
};

const QUIET: BookingReadResource = {
  ...READ,
  changes: { new: 0, changed: 0, cancelled: 0 },
  newIds: [],
  actors: [],
};

function serve(state: BookingReadResource) {
  server.use(http.get("/api/v1/events/7/booking-read", () => HttpResponse.json(state)));
}

async function renderLine() {
  setMockUser("demo.committee");
  await renderWithSession(<BookingReadLine eventId={7} />, { route: "/events/7/registrations" });
  return screen.findByTestId("booking-read");
}

test("says who read it and what changed since", async () => {
  serve(READ);

  const line = await renderLine();

  expect(line).toHaveTextContent(/Lu le .*2026.* par Marie Comité/);
  expect(line).toHaveTextContent("2 nouvelles et 1 annulée par Paul Direction");
});

test("says when nobody has read it yet", async () => {
  serve({ ...READ, readAt: null, readBy: null });

  const line = await renderLine();

  expect(line).toHaveTextContent("Pas encore lu");
});

test("offers unread only after a read", async () => {
  serve({ ...READ, readAt: null, readBy: null });
  await renderLine();
  expect(screen.queryByRole("button", { name: "Marquer comme non lu" })).toBeNull();
  expect(screen.getByRole("button", { name: "Marquer comme lu" })).toBeInTheDocument();
});

test("offers unread once read", async () => {
  serve(QUIET);
  const line = await renderLine();

  expect(line).toHaveTextContent("Aucun changement depuis");
  expect(screen.getByRole("button", { name: "Marquer comme non lu" })).toBeInTheDocument();
  // Nothing new: nothing to mark.
  expect(screen.queryByRole("button", { name: "Marquer comme lu" })).toBeNull();
});

test("mark read sends the loaded latest change", async () => {
  serve(READ);
  let sent: unknown = null;
  server.use(
    http.put("/api/v1/events/7/booking-read", async ({ request }) => {
      sent = await request.json();
      return HttpResponse.json({ ...QUIET, readBy: "Camille Committee" });
    }),
  );
  const user = userEvent.setup();
  const line = await renderLine();

  await user.click(screen.getByRole("button", { name: "Marquer comme lu" }));

  expect(sent).toEqual({ upTo: 12 });
  expect(await screen.findByText(/Aucun changement depuis/)).toBeInTheDocument();
  expect(line).toHaveTextContent("par Camille Committee");
});

test("mark unread brings the changes back", async () => {
  serve(QUIET);
  server.use(http.delete("/api/v1/events/7/booking-read", () => HttpResponse.json(READ)));
  const user = userEvent.setup();
  await renderLine();

  await user.click(screen.getByRole("button", { name: "Marquer comme non lu" }));

  expect(await screen.findByText(/2 nouvelles et 1 annulée/)).toBeInTheDocument();
});
