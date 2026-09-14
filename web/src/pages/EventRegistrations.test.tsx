import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { beforeEach, expect, test, vi } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { EventRegistrations } from "./EventRegistrations";

/** The seeded souper, the only event with bookings against it. */
const SOUPER = 7;

/**
 * jsdom implements neither half of a download: `URL.createObjectURL` is
 * undefined and clicking an anchor navigates nowhere. Stubbed rather than
 * skipped, because what these tests are about is which REQUEST is made and
 * what happens when it is refused — the browser's own save dialog is not
 * this app's behaviour to assert.
 */
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
});

async function renderGuestList(
  as: "demo.direction" | "demo.committee" = "demo.direction",
  eventId = SOUPER,
) {
  setMockUser(as);
  const result = await renderWithSession(
    <Routes>
      <Route path="/events/:id/registrations" element={<EventRegistrations />} />
    </Routes>,
    { route: `/events/${eventId}/registrations` },
  );
  await screen.findByTestId("guest-counts");
  return result;
}

/**
 * BOTH LAYOUTS ARE IN THE DOM AT ONCE and Tailwind picks by viewport, so a
 * query that is not scoped finds each guest twice. jsdom applies no CSS.
 */
function table() {
  return screen.getByTestId("guest-table");
}

/** The one table row containing this text. */
function rowSaying(text: string) {
  const row = within(table())
    .getAllByRole("row")
    .find((candidate) => candidate.textContent?.includes(text));

  if (!row) {
    throw new Error(`no guest row contains "${text}"`);
  }

  return row;
}

test("leads with the three numbers the committee acts on", async () => {
  await renderGuestList();

  // Two bookings, six people between them, and CHF 150.00 — the second
  // booking took only an unpriced option, so it adds people and no money.
  expect(screen.getByTestId("guest-counts")).toHaveTextContent("2 inscriptions");
  expect(screen.getByTestId("guest-counts")).toHaveTextContent("6 personnes");
  expect(screen.getByTestId("guest-counts")).toHaveTextContent("150.00");
});

test("shows what each guest ordered and what it comes to", async () => {
  await renderGuestList();

  const rows = within(table()).getAllByRole("row");
  const jeanne = rows.find((row) => row.textContent?.includes("Aebischer Jeanne"));

  expect(jeanne).toBeDefined();
  expect(jeanne!).toHaveTextContent("2 × Repas adulte, 3 × Repas enfant");
  expect(jeanne!).toHaveTextContent("CHF 150.00");
});

/**
 * A booking whose options carry no price owes an UNKNOWN amount, not zero.
 * "CHF 0.00" in that cell would tell the committee somebody is paying nothing.
 */
test("leaves the total empty for a booking of unpriced options", async () => {
  await renderGuestList();

  // NOT `includes("Python")`: Jeanne's seeded table preference is "Avec la
  // famille Python", so that matched HER row and the assertion passed for the
  // wrong reason until it did not. The order is what distinguishes them.
  const marc = rowSaying("1 × Sans repas");

  expect(marc).toHaveTextContent("Python Marc");
  expect(marc).not.toHaveTextContent("CHF");
});

/**
 * THE TWO PERMISSIONS ON ONE SCREEN.
 *
 * MUTATION TEST: render the row actions unconditionally and this fails.
 * `demo.committee` holds `registrations.view` as their ONLY permission — the
 * role exists so somebody can read this list — and amending or cancelling
 * somebody's booking is a different act on a stranger's personal data.
 */
test("a viewer gets the list and no way to change it", async () => {
  await renderGuestList("demo.committee");

  expect(within(table()).getByText(/Aebischer/)).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Corriger/ })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Annuler l’inscription/ })).not.toBeInTheDocument();
});

test("somebody who may manage gets both controls on every row", async () => {
  await renderGuestList();

  // Once per layout, cards and table, which is the price of both being in the
  // DOM at once.
  expect(
    screen.getAllByRole("button", { name: "Corriger l’inscription de Jeanne Aebischer" }),
  ).toHaveLength(2);
});

/**
 * THE CONDITIONAL WRITE.
 *
 * MUTATION TEST: drop `ifMatch(etag)` from the PATCH and this fails with the
 * mocked backend's 428, exactly as the real API would answer. The tag comes
 * from the read the form opened with, which is the window the check is meant
 * to cover.
 */
test("corrects a booking, quoting the tag the form opened with", async () => {
  const user = userEvent.setup();
  let ifMatch: string | null = "not seen";

  server.use(
    http.patch("/api/v1/registrations/:id", async ({ request }) => {
      ifMatch = request.headers.get("If-Match");
      return HttpResponse.json({
        id: 1,
        firstName: "Jeanne",
        lastName: "Aebischer",
        email: "jeanne.aebischer@example.ch",
        phone: "079 123 45 67",
        address: null,
        tableName: "Table du comité",
        choices: [],
        guestCount: 0,
        totalCents: null,
        createdAt: "2026-09-01T18:24:00.000Z",
      });
    }),
  );

  await renderGuestList();
  await user.click(
    within(table()).getByRole("button", { name: "Corriger l’inscription de Jeanne Aebischer" }),
  );

  const tableField = await screen.findByLabelText("Table");
  await user.clear(tableField);
  await user.type(tableField, "Table du comité");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  await expect.poll(() => ifMatch).not.toBe("not seen");
  expect(ifMatch).toMatch(/^"[0-9a-f]+"$/);
});

test("a correction lands on the list", async () => {
  const user = userEvent.setup();
  await renderGuestList();

  await user.click(
    within(table()).getByRole("button", { name: "Corriger l’inscription de Jeanne Aebischer" }),
  );

  const phone = await screen.findByLabelText("Téléphone");
  await user.clear(phone);
  await user.type(phone, "079 999 99 99");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  // The panel closes only on a successful write, so its absence IS the
  // assertion that the write went through.
  await expect.poll(() => screen.queryByLabelText("Téléphone")).toBeNull();
  // On the ROW, not with getByText: the contact cell holds the e-mail and the
  // number separated by a <br>, so no single element's text is the number.
  expect(rowSaying("Aebischer Jeanne")).toHaveTextContent("079 999 99 99");
});

/**
 * WHAT WAS ORDERED IS NOT EDITABLE, matching the API, whose PATCH has no
 * `choices` field. A form that silently omitted the thing somebody came to
 * change is a form they will look for twice, so the panel says so.
 */
test("the correction panel says the order is not changed here", async () => {
  const user = userEvent.setup();
  await renderGuestList();

  await user.click(
    within(table()).getByRole("button", { name: "Corriger l’inscription de Jeanne Aebischer" }),
  );

  expect(await screen.findByText(/La commande ne se modifie pas ici/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/Repas adulte/)).not.toBeInTheDocument();
});

/**
 * Cancelling asks for the surname to be typed, because the guest is NOT
 * notified: somebody outside the band loses their place, hears nothing, and
 * cannot re-book once the window has shut.
 */
test("cancelling names the damage and stays inert until the name is typed", async () => {
  const user = userEvent.setup();
  await renderGuestList();

  await user.click(
    within(table()).getByRole("button", { name: "Annuler l’inscription de Jeanne Aebischer" }),
  );

  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/La personne n’est pas prévenue/)).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Annuler l’inscription" }));
  // Still there: the confirmation is not armed.
  expect(within(table()).getByText(/Aebischer/)).toBeInTheDocument();

  await user.type(within(dialog).getByLabelText(/Tapez/), "Aebischer");
  await user.click(within(dialog).getByRole("button", { name: "Annuler l’inscription" }));

  await expect.poll(() => screen.queryByText(/Aebischer/)).toBeNull();
  expect(screen.getByTestId("guest-counts")).toHaveTextContent("1 inscription");
});

test("offers the four downloads and asks the server for the one that was clicked", async () => {
  const user = userEvent.setup();
  const asked: string[] = [];

  server.use(
    http.get("/api/v1/events/:id/registrations.:format", ({ params }) => {
      asked.push(String(params.format));
      return HttpResponse.text("ok", {
        headers: { "Content-Disposition": 'attachment; filename="souper-inscriptions.csv"' },
      });
    }),
  );

  await renderGuestList();

  for (const label of ["Excel", "CSV", "Markdown", "JSON"]) {
    await user.click(screen.getByRole("button", { name: label }));
  }

  await expect.poll(() => asked).toEqual(["xlsx", "csv", "md", "json"]);
});

/**
 * The one refusal on that endpoint an operator can act on: a server without
 * ext-zip answers `503 xlsx_unavailable`, and CSV still works there.
 *
 * A plain `<a download>` could not do this. The problem document would be
 * saved as souper-inscriptions.xlsx and opened in Excel as JSON, which is why
 * the download goes through fetch.
 */
test("says in French when a server cannot make an Excel file", async () => {
  const user = userEvent.setup();

  server.use(
    http.get("/api/v1/events/:id/registrations.xlsx", () =>
      HttpResponse.json(
        { title: "XLSX unavailable", status: 503, code: "xlsx_unavailable" },
        { status: 503 },
      ),
    ),
  );

  await renderGuestList();
  await user.click(screen.getByRole("button", { name: "Excel" }));

  // A STRAIGHT apostrophe, because that is what fr.ts's error catalogue uses
  // throughout — unlike the page copy around it, which uses the typographic
  // one. Matching on the wrong character fails with "unable to find the text",
  // which reads as a missing message rather than as a missing quote mark.
  expect(await screen.findByText(/L'export Excel n'est pas disponible/)).toBeInTheDocument();
});

test("an event nobody has booked says where the form is", async () => {
  // Event 1 is a rehearsal: no options, no bookings.
  await renderGuestList("demo.direction", 1);

  expect(screen.getByText(/Personne ne s’est encore inscrit/)).toBeInTheDocument();
  expect(screen.queryByTestId("guest-table")).not.toBeInTheDocument();
});
