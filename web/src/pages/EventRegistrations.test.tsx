import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { beforeEach, expect, onTestFinished, test, vi } from "vitest";

import { type Locale } from "../i18n/locale";
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
  locale: Locale = "fr",
) {
  setMockUser(as);
  const result = await renderWithSession(
    <Routes>
      <Route path="/events/:id/registrations" element={<EventRegistrations />} />
    </Routes>,
    { route: `/events/${eventId}/registrations`, locale },
  );
  await screen.findByTestId("guest-counts");
  return result;
}

/**
 * The guest list. One layout since #130 — there was a table beside these cards
 * until 2026-09-18, both in the DOM at once, and every query here had to say
 * which of the two it meant or find each guest twice.
 */
function cards() {
  return screen.getByTestId("guest-cards");
}

/** A priced, unpaid booking with these lines, for list overrides. */
function booking(
  id: number,
  lastName: string,
  choices: { optionId: number; label: string; quantity: number }[],
) {
  return {
    id,
    firstName: "Test",
    lastName,
    email: `${lastName.toLowerCase()}@example.ch`,
    phone: "079 000 00 00",
    address: null,
    tableName: null,
    choices: choices.map((choice) => ({ ...choice, priceCents: 4500 })),
    guestCount: choices.reduce((sum, choice) => sum + choice.quantity, 0),
    totalCents: 4500 * choices.reduce((sum, choice) => sum + choice.quantity, 0),
    paidAt: null,
    createdAt: "2026-09-01T18:24:00.000Z",
  };
}

/** The one guest card containing this text. */
function cardFor(text: string) {
  const card = within(cards())
    .getAllByRole("listitem")
    .find((candidate) => candidate.textContent?.includes(text));

  if (!card) {
    throw new Error(`no guest card contains "${text}"`);
  }

  return card;
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

  const jeanne = cardFor("Aebischer Jeanne");

  expect(jeanne).toHaveTextContent("2 × Repas adulte, 3 × Repas enfant");
  expect(jeanne).toHaveTextContent("CHF 150.00");
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
  const marc = cardFor("1 × Sans repas");

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

  expect(within(cards()).getByText(/Aebischer/)).toBeInTheDocument();
  // queryAllByRole().toHaveLength(0), NOT queryByRole().not.toBeInTheDocument():
  // the guest list holds several bookings, so the gate this guards against
  // losing brings back one control PER BOOKING once it does. The singular
  // query then THROWS "found multiple elements" the moment that happens —
  // the mutation fails for the right reason with the wrong message, which
  // reads as a broken query rather than as a lost permission. Same fix as
  // `expectNoSuchAction` in Events.test.tsx:70-73, and for the same reason.
  //
  // STILL A PAGE-WIDE QUERY, and only because this screen has two actions and
  // RowActions therefore draws no menu. A third action turns this into a
  // closed menu and this assertion into a tautology, because a closed Radix
  // menu's items are not in the DOM at all.
  expect(screen.queryAllByRole("button", { name: /^Corriger/ })).toHaveLength(0);
  expect(screen.queryAllByRole("button", { name: /^Annuler l’inscription/ })).toHaveLength(0);
});

test("somebody who may manage gets both controls on every row", async () => {
  await renderGuestList();

  // ONCE, not twice. There were two of this button until #130 — one per
  // layout, both in the DOM — and the count is worth asserting because it is
  // what a second layout coming back would change first.
  expect(
    screen.getAllByRole("button", { name: "Corriger l’inscription de Jeanne Aebischer" }),
  ).toHaveLength(1);
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
    within(cards()).getByRole("button", { name: "Corriger l’inscription de Jeanne Aebischer" }),
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
    within(cards()).getByRole("button", { name: "Corriger l’inscription de Jeanne Aebischer" }),
  );

  const phone = await screen.findByLabelText("Téléphone");
  await user.clear(phone);
  await user.type(phone, "079 999 99 99");
  await user.click(screen.getByRole("button", { name: "Enregistrer" }));

  // The panel closes only on a successful write, so its absence IS the
  // assertion that the write went through.
  await expect.poll(() => screen.queryByLabelText("Téléphone")).toBeNull();
  // The number is now its own element and its own link, so this asserts the
  // amended value AND that the new markup survives an amendment round-trip --
  // strictly stronger than the toHaveTextContent on the row it replaces.
  expect(
    within(cardFor("Aebischer Jeanne")).getByRole("link", { name: "079 999 99 99" }),
  ).toHaveAttribute("href", "tel:0799999999");
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
    within(cards()).getByRole("button", { name: "Corriger l’inscription de Jeanne Aebischer" }),
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
    within(cards()).getByRole("button", { name: "Annuler l’inscription de Jeanne Aebischer" }),
  );

  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText(/La personne n’est pas prévenue/)).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Annuler l’inscription" }));
  // Still there: the confirmation is not armed.
  expect(within(cards()).getByText(/Aebischer/)).toBeInTheDocument();

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

  for (const label of ["Excel", "CSV"]) {
    await user.click(screen.getByRole("button", { name: label }));
  }
  // The developer formats are one step further away (#115), and still there.
  await user.click(screen.getByText("Autres formats"));
  for (const label of ["Markdown", "JSON"]) {
    await user.click(screen.getByRole("button", { name: label }));
  }

  await expect.poll(() => asked).toEqual(["xlsx", "csv", "md", "json"]);
});

test("Markdown and JSON are not beside Excel at equal weight", async () => {
  await renderGuestList();

  // Inside a closed <details>: in the DOM, not visible. MUTATION TEST: move
  // them back into FORMATS and both assertions fail.
  expect(screen.getByRole("button", { name: "Excel" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Markdown", hidden: true })).not.toBeVisible();
  expect(screen.getByRole("button", { name: "JSON", hidden: true })).not.toBeVisible();
});

/* ---------------------------------------------------------------------------
 * The kitchen view (#115)
 * -------------------------------------------------------------------------- */

test("tells the kitchen how many of each option were booked", async () => {
  await renderGuestList();

  // Jeanne took 2 adult and 3 child meals, Marc one "Sans repas". MUTATION
  // TEST: count bookings instead of summing quantities and the first entry
  // reads "1 × Repas adulte".
  const totals = within(screen.getByTestId("option-totals")).getAllByRole("listitem");
  expect(totals.map((item) => item.textContent)).toEqual([
    "2 × Repas adulte",
    "3 × Repas enfant",
    "1 × Sans repas",
  ]);
});

test("the per-option totals add up across bookings", async () => {
  server.use(
    http.get("*/api/v1/events/:id/registrations", () =>
      HttpResponse.json({
        data: [
          booking(1, "Aebischer", [{ optionId: 1, label: "Repas adulte", quantity: 2 }]),
          booking(2, "Rossier", [
            { optionId: 1, label: "Repas adulte", quantity: 4 },
            { optionId: 2, label: "Repas enfant", quantity: 1 },
          ]),
        ],
        meta: { total: 2, limit: 500, offset: 0 },
      }),
    ),
  );

  await renderGuestList();

  const totals = within(screen.getByTestId("option-totals")).getAllByRole("listitem");
  expect(totals.map((item) => item.textContent)).toEqual(["6 × Repas adulte", "1 × Repas enfant"]);
});

test("says how many of the bookings that owe something have paid", async () => {
  await renderGuestList();

  // Only Jeanne's booking carries a price; Marc's owes an unknown amount and
  // is not counted either way.
  expect(screen.getByTestId("guest-counts")).toHaveTextContent("0 sur 1 payée");
});

test("marks a booking paid, quoting a tag, and the list shows it", async () => {
  const user = userEvent.setup();
  const sent: { body: unknown; ifMatch: string | null }[] = [];
  const record = ({ request }: { request: Request }) => {
    if (request.method === "PATCH") {
      void request
        .clone()
        .json()
        .then((body: unknown) => sent.push({ body, ifMatch: request.headers.get("If-Match") }));
    }
  };
  server.events.on("request:start", record);
  onTestFinished(() => server.events.removeListener("request:start", record));

  await renderGuestList();

  const jeanne = cardFor("Aebischer Jeanne");
  expect(within(jeanne).getByTestId("payment")).toHaveTextContent("Non payé");

  await user.click(
    within(jeanne).getByRole("button", {
      name: "Marquer l’inscription de Jeanne Aebischer comme payée",
    }),
  );

  await expect
    .poll(() => within(cardFor("Aebischer Jeanne")).getByTestId("payment").textContent)
    .toContain("Payé");
  expect(within(cardFor("Aebischer Jeanne")).getByTestId("payment")).not.toHaveTextContent(
    "Non payé",
  );
  expect(screen.getByTestId("guest-counts")).toHaveTextContent("1 sur 1 payée");
  expect(sent).toEqual([{ body: { paid: true }, ifMatch: expect.stringMatching(/^"[0-9a-f]+"$/) }]);
});

test("a booking with no price has no payment to record", async () => {
  await renderGuestList();

  expect(within(cardFor("1 × Sans repas")).queryByTestId("payment")).toBeNull();
});

test("a viewer sees who has paid and cannot change it", async () => {
  await renderGuestList("demo.committee");

  expect(within(cardFor("Aebischer Jeanne")).getByTestId("payment")).toHaveTextContent("Non payé");
  expect(screen.queryAllByRole("button", { name: /comme payée$/ })).toHaveLength(0);
});

test("the cancel dialog's way out does not also say Annuler", async () => {
  const user = userEvent.setup();
  await renderGuestList();

  await user.click(
    within(cards()).getByRole("button", { name: "Annuler l’inscription de Jeanne Aebischer" }),
  );

  const dialog = await screen.findByRole("alertdialog");
  // MUTATION TEST: drop dismissLabel and the first assertion fails.
  expect(within(dialog).queryByRole("button", { name: "Annuler" })).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Garder l’inscription" }));

  await expect.poll(() => screen.queryByRole("alertdialog")).toBeNull();
  expect(within(cards()).getByText(/Aebischer/)).toBeInTheDocument();
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
  expect(screen.queryByTestId("guest-cards")).not.toBeInTheDocument();
});

test("the guest card carries the postal address", async () => {
  await renderGuestList();

  // The regression this screen actually shipped: the card rendered
  // `booking.address` from the day it was written and the table never did, so
  // the desktop view carried LESS than the phone view for the same row (#98).
  // There is one layout now (#130), so the two cannot disagree — this pins the
  // field itself, which is the half that still matters.
  expect(cardFor("Aebischer Jeanne")).toHaveTextContent("Route des Alpes 12, 1700 Fribourg");
});

/**
 * This pair of assertions used to be written out twice, once per layout, which
 * is what two hand-maintained copies of one row costs a suite. One layout, one
 * test.
 */
test("a card's e-mail and phone are tappable and its address is not", async () => {
  await renderGuestList();

  const card = cardFor("Aebischer Jeanne");
  const links = within(card).getAllByRole("link");

  // Corriger and Annuler are buttons, so the only links on the card are these.
  expect(links).toHaveLength(2);
  expect(links[0]).toHaveAttribute("href", "mailto:jeanne.aebischer@example.ch");
  expect(links[1]).toHaveAttribute("href", "tel:0791234567");
  // The "no geo:, no maps URL" decision, pinned: a max:255 free-text address
  // makes a confidently wrong pin.
  expect(within(card).queryByRole("link", { name: /Route des Alpes/ })).toBeNull();
});

test("the contact block reads as three separate facts, not one run-on string", async () => {
  await renderGuestList();

  const stack = within(cardFor("Aebischer Jeanne")).getByTestId("guest-contact");

  // Asserted POSITIVELY. A lone `querySelector("br")` null check passes on an
  // empty block and on one holding a single text node, so it is never the only
  // assertion here.
  expect(stack.children).toHaveLength(3);
  expect(stack.children[0]).toHaveTextContent("jeanne.aebischer@example.ch");
  expect(stack.children[1]).toHaveTextContent("079 123 45 67");
  expect(stack.children[2]).toHaveTextContent("Route des Alpes 12, 1700 Fribourg");
  expect(stack.querySelector("br")).toBeNull();
});

test("a booking with no address gets two lines, not an empty third", async () => {
  await renderGuestList();

  // Marc Python's address is null. Render it unconditionally and this fails --
  // the card's own guard, carried across correctly.
  const stack = within(cardFor("Python Marc")).getByTestId("guest-contact");

  expect(stack.children).toHaveLength(2);
});

test("a phone nobody can dial stays plain text", async () => {
  server.use(
    http.get("*/api/v1/events/:id/registrations", () =>
      HttpResponse.json({
        data: [
          {
            id: 1,
            firstName: "Jeanne",
            lastName: "Aebischer",
            email: "jeanne.aebischer@example.ch",
            phone: "à demander",
            address: null,
            tableName: null,
            choices: [],
            guestCount: 1,
            totalCents: null,
            createdAt: "2026-09-01T18:24:00.000Z",
          },
        ],
        meta: { total: 1, limit: 500, offset: 0 },
      }),
    ),
  );

  await renderGuestList();

  // The PRESENCE half is what makes this honest: assert only the absence and
  // the test passes just as well when the override never applied or the row
  // never rendered at all.
  const card = cardFor("Aebischer");

  expect(within(card).getByText("à demander")).toBeInTheDocument();
  expect(within(card).queryByRole("link", { name: "à demander" })).toBeNull();
});

/* ---------------------------------------------------------------------------
 * The guest list in German (#157)
 * -------------------------------------------------------------------------- */

test("both counts pluralise in German, and the total groups the German way", async () => {
  await renderGuestList("demo.direction", SOUPER, "de-CH");

  // THE HEADING AND THE PER-CARD COUNT WERE BOTH MISSED on the first pass and
  // found by reading the rendered page: "INSCRIPTIONS" over a German list, and
  // "5 personnes" under each booking. Neither carries an accent, so neither
  // grep over the file saw them — the same shape as #156's "5 membres".
  expect(screen.getByRole("heading", { level: 1, name: "Anmeldungen" })).toBeInTheDocument();

  const counts = screen.getByTestId("guest-counts");
  expect(counts).toHaveTextContent("2 Anmeldungen");
  expect(counts).toHaveTextContent("6 Personen");

  const first = within(screen.getByTestId("guest-cards")).getAllByRole(
    "listitem",
  )[0] as HTMLElement;
  expect(first).toHaveTextContent("5 Personen");
  expect(first).toHaveTextContent("Tisch:");

  // THE GROUP SEPARATOR IS THE READER'S. money.ts was pinned to fr-CH, so a
  // German page grouped with a narrow space; the apostrophe is Swiss German's.
  // 150.00 has no group separator, so the assertion that matters is in
  // money.test.ts — this one only proves the screen goes through the
  // locale-aware formatter at all.
  expect(counts).toHaveTextContent("CHF");
});

test("THE TWO ANNULERS BECOME TWO DIFFERENT GERMAN WORDS", async () => {
  // The row button cancels a BOOKING; the amend form's button closes the form
  // without doing anything. French calls both "Annuler" — which is why #115
  // wants the French half renamed, and why German cannot wait for it.
  //
  // MUTATION TEST: point registrations.cancel at common.cancel and the first
  // query below finds nothing, because the row button would read "Abbrechen".
  await renderGuestList("demo.direction", SOUPER, "de-CH");

  const row = within(screen.getByTestId("guest-cards")).getAllByRole("listitem")[0] as HTMLElement;
  const cancel = within(row).getByRole("button", { name: /stornieren$/ });
  expect(cancel).toHaveTextContent("Stornieren");

  // The amend form's way out is the other word entirely.
  await userEvent.click(within(row).getByRole("button", { name: /korrigieren$/ }));
  const form = await screen.findByRole("button", { name: "Abbrechen" });
  expect(form).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Stornieren" })).not.toBe(form);
});

test("cancelling names the guest, and the dialog asks where the button labels", async () => {
  await renderGuestList("demo.direction", SOUPER, "de-CH");

  const row = within(screen.getByTestId("guest-cards")).getAllByRole("listitem")[0] as HTMLElement;
  const button = within(row).getByRole("button", { name: /stornieren$/ });
  const name = (button.getAttribute("aria-label") ?? "")
    .replace(/^Anmeldung von /, "")
    .replace(/ stornieren$/, "");

  await userEvent.click(button);

  // TWO KEYS, NOT ONE. The button LABELS and the dialog ASKS — the French
  // dialog ends "… ?" with the space French puts before a question mark, and
  // the button does not. Sharing a key would have put a question mark on a
  // button.
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName(`Anmeldung von ${name} stornieren?`);
  expect(button.getAttribute("aria-label")).toBe(`Anmeldung von ${name} stornieren`);

  expect(within(dialog).getByRole("button", { name: "Anmeldung stornieren" })).toBeInTheDocument();
});
