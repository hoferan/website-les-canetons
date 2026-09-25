import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { EventBooking } from "./EventBooking";

/** The seeded souper — the only event in the mocked planning that takes bookings. */
const SOUPER = 7;

/** A rehearsal, which takes none. */
const REHEARSAL = 1;

/**
 * The form is reached through a route parameter, so it has to be rendered
 * behind one: `useParams` returns nothing for a component mounted outside a
 * matching Route and the screen then reads event NaN.
 */
async function renderBooking(eventId: number = SOUPER, locale: Locale = "fr") {
  const result = await renderWithSession(
    <Routes>
      <Route path="/events/:id/book" element={<EventBooking />} />
    </Routes>,
    { route: `/events/${eventId}/book`, locale },
  );
  await screen.findByRole("heading", { level: 1 });
  return result;
}

/** The four required fields, filled with something the API would accept. */
async function fillInContact(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nom", { exact: true }), "Testeuse");
  await user.type(screen.getByLabelText("Prénom"), "Aline");
  await user.type(screen.getByLabelText("E-mail"), "aline@example.ch");
  await user.type(screen.getByLabelText("Téléphone"), "079 000 00 00");
}

/** Orders `quantity` of one option, by the label the guest reads. */
async function order(user: ReturnType<typeof userEvent.setup>, label: RegExp, quantity: number) {
  await user.type(screen.getByLabelText(label), String(quantity));
}

test("shows what is on offer, and what each thing costs", async () => {
  await renderBooking();

  expect(screen.getByRole("heading", { name: "Souper de soutien" })).toBeInTheDocument();
  expect(screen.getByText(/Salle de la Grenette/)).toBeInTheDocument();
  expect(screen.getByLabelText(/Repas adulte/)).toBeInTheDocument();
  expect(screen.getByText(/Repas adulte/)).toHaveTextContent("CHF 45.00");

  // The per-booking cap is worth saying BEFORE somebody types seven, not as a
  // refusal after they have.
  expect(screen.getByText(/au maximum 6 personnes/)).toBeInTheDocument();
});

/**
 * The one option with no price at all.
 *
 * `priceCents: null` means the price is not stated here, which is a different
 * thing from free — and "CHF 0.00" beside an option would assert the second.
 */
test("an option with no price says nothing rather than claiming to be free", async () => {
  await renderBooking();

  const label = screen.getByText(/Sans repas/);
  expect(label).not.toHaveTextContent("CHF");
});

/**
 * THE RUNNING TOTAL, which is why prices are integers on the wire.
 *
 * A guest deciding between two adult meals and three should read what each
 * costs before submitting rather than after.
 */
test("adds up what has been chosen as it is chosen", async () => {
  const user = userEvent.setup();
  await renderBooking();

  expect(screen.getByTestId("booking-total")).toHaveTextContent(
    "Choisissez au moins une personne.",
  );

  await order(user, /Repas adulte/, 2);
  await order(user, /Repas enfant/, 3);

  // 2 x 45.00 + 3 x 20.00, and five people.
  expect(screen.getByTestId("booking-total")).toHaveTextContent("5 personnes");
  expect(screen.getByTestId("booking-total")).toHaveTextContent("150.00");
});

test("books a place and answers in place, without navigating", async () => {
  const user = userEvent.setup();
  await renderBooking();

  await fillInContact(user);
  await order(user, /Repas adulte/, 2);
  await order(user, /Repas enfant/, 3);
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  expect(
    await screen.findByRole("heading", { name: "Inscription enregistrée" }),
  ).toBeInTheDocument();

  // What was booked, read back from the SERVER's answer rather than from the
  // form's own state: the totals are the API's, so the screen, the guest list
  // and the confirmation mail cannot disagree about them.
  const summary = screen.getByTestId("booking-summary");
  expect(within(summary).getByText("2 × Repas adulte")).toBeInTheDocument();
  expect(within(summary).getByText("3 × Repas enfant")).toBeInTheDocument();

  // The form is GONE rather than covered: a success panel above a live form
  // invites a second booking of the same five people.
  expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();
});

/**
 * THE THREE PROTECTIONS, asserted on the wire.
 *
 * `publicWriteHeaders` returning the right object proves nothing if the screen
 * forgets to pass it, which is the whole failure mode: `registrationStore`
 * compiles perfectly well without its third argument. Same test as the contact
 * form's, for the same reason.
 */
test("carries the form token, an idempotency key and an empty honeypot", async () => {
  const user = userEvent.setup();
  let sent: { token: string | null; key: string | null; website: unknown } | null = null;

  server.use(
    http.post("/api/v1/events/:id/registrations", async ({ request }) => {
      const body = (await request.json()) as { website?: unknown };
      sent = {
        token: request.headers.get("X-Form-Token"),
        key: request.headers.get("Idempotency-Key"),
        website: body.website,
      };
      // A REAL RegistrationResource, not `{ok: true}`. The success view
      // renders the server's own answer, so a stub of the wrong shape crashes
      // it — which the first draft of this test did, and which is worth
      // knowing: a handler override is a promise about the contract too.
      return HttpResponse.json(
        {
          id: 9,
          firstName: "Aline",
          lastName: "Testeuse",
          email: "aline@example.ch",
          phone: "079 000 00 00",
          address: null,
          tableName: null,
          choices: [{ optionId: 1, label: "Repas adulte", quantity: 1, priceCents: 4500 }],
          guestCount: 1,
          totalCents: 4500,
          createdAt: "2026-09-14T10:00:00.000Z",
        },
        { status: 201 },
      );
    }),
  );

  await renderBooking();
  await fillInContact(user);
  await order(user, /Repas adulte/, 1);
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  await expect.poll(() => sent).not.toBeNull();
  expect(sent!.token).toBe("mock-form-token");
  // 36 characters, a crypto.randomUUID, inside the API's 16-255 window.
  expect(sent!.key).toHaveLength(36);
  // PRESENT AND EMPTY. A body that merely omits it is refused exactly like one
  // that fills it in, which is what stops a hand-written POST walking past the
  // guard by leaving the field out.
  expect(sent!.website).toBe("");
});

/**
 * The cap, refused by the server against `choices` and rendered there.
 *
 * The token is PARAMLESS on purpose: the closure validator that raises it
 * emits field and reason only, so a French string interpolating the maximum
 * would print a literal {{max}} on a guest's screen.
 */
test("a booking over the cap is refused in French, against the choice list", async () => {
  const user = userEvent.setup();
  await renderBooking();

  await fillInContact(user);
  await order(user, /Repas adulte/, 7);
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  const refusal = await screen.findByText(/dépasse le nombre de personnes autorisé/);
  expect(refusal).toBeInTheDocument();
  expect(refusal.textContent).not.toMatch(/\{\{/);

  // The form stays OPEN and keeps what was typed: a rejected booking must not
  // make somebody fill it in again.
  expect(screen.getByLabelText("Prénom")).toHaveValue("Aline");
});

/**
 * An event that takes no bookings answers 404 whether or not it exists, and
 * the page must not give away which. Event 1 is a seeded rehearsal.
 */
test("an event that takes no bookings says so without saying it exists", async () => {
  await renderBooking(REHEARSAL);

  const message = screen.getByText(/pas d’inscription ouverte pour cette adresse/);
  expect(message).toBeInTheDocument();
  // No title, no date, no location: the refusal for a real event and for an
  // invented id read identically.
  expect(screen.queryByText(/Répétition/)).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "M’inscrire" })).not.toBeInTheDocument();
});

/**
 * MUTATION TEST: render the form whenever `closesAt` is in the future and this
 * fails. `open` is computed by the SERVER, and a browser with a wrong clock is
 * exactly the case the server computing it exists for — the guest would fill
 * the whole thing in and be refused on submit.
 */
test("a window that has not opened yet says when it will, and offers no form", async () => {
  server.use(
    http.get("/api/v1/events/:id/registration", () =>
      HttpResponse.json({
        event: {
          id: SOUPER,
          title: "Souper de soutien",
          startsAt: "2026-11-21T17:30:00.000Z",
          endsAt: "2026-11-21T22:30:00.000Z",
          location: "Salle de la Grenette, Fribourg",
          registrationOpen: false,
        },
        options: [],
        maxGuests: 6,
        opensAt: "2026-10-03T00:00:00.000Z",
        closesAt: "2026-11-14T23:00:00.000Z",
        open: false,
      }),
    ),
  );

  await renderBooking();

  expect(screen.getByText("Les inscriptions ouvrent le 3 octobre 2026.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();
});

test("a window that has shut says so rather than naming a date", async () => {
  server.use(
    http.get("/api/v1/events/:id/registration", () =>
      HttpResponse.json({
        event: {
          id: SOUPER,
          title: "Souper de soutien",
          startsAt: "2026-11-21T17:30:00.000Z",
          endsAt: "2026-11-21T22:30:00.000Z",
          location: "Salle de la Grenette, Fribourg",
          registrationOpen: false,
        },
        options: [],
        maxGuests: null,
        opensAt: null,
        closesAt: "2026-01-14T23:00:00.000Z",
        open: false,
      }),
    ),
  );

  await renderBooking();

  expect(screen.getByText("Les inscriptions sont closes.")).toBeInTheDocument();
  expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();
});

/* ---------------------------------------------------------------------------
 * The public form in German (#157)
 * -------------------------------------------------------------------------- */

test("THE PUBLIC BOOKING FORM IS GERMAN, which is what this whole effort is for", async () => {
  // A German speaker in Fribourg booking a seat at the souper, on a phone, at
  // the hall. It is the one screen in this slice a stranger reaches.
  await renderBooking(SOUPER, "de-CH");

  // The field labels were a module-scope array of French `label`s, frozen at
  // import — `labelKey`, not `label`, the third file with this (after
  // Layout's NAV and SeriesForm's WEEKDAYS).
  expect(screen.getByLabelText("Name")).toBeInTheDocument();
  expect(screen.getByLabelText("Vorname")).toBeInTheDocument();
  expect(screen.getByLabelText("E-Mail")).toBeInTheDocument();
  expect(screen.getByLabelText("Telefon")).toBeInTheDocument();
  expect(screen.getByLabelText("Tisch")).toBeInTheDocument();

  expect(screen.getByRole("group", { name: "Ihre Kontaktangaben" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Anmelden" })).toBeInTheDocument();

  // MUTATION TEST: put `label` back on the array and these read French,
  // because the module body runs before any locale is chosen.
  expect(screen.queryByLabelText("Prénom")).toBeNull();

  // The legend was a bare JSX text node with no accent in it — "Votre choix"
  // survived the first pass for exactly the reason "5 membres" did in #156.
  expect(screen.getByRole("group", { name: "Ihre Auswahl" })).toBeInTheDocument();
});

test("the running total counts in German and prices in Swiss German", async () => {
  await renderBooking(SOUPER, "de-CH");

  // Nothing chosen: its own sentence, not a count of zero.
  expect(screen.getByTestId("booking-total")).toHaveTextContent(
    "Wählen Sie mindestens eine Person.",
  );

  const boxes = screen.getAllByRole("spinbutton");
  await userEvent.clear(boxes[0] as HTMLElement);
  await userEvent.type(boxes[0] as HTMLElement, "1");

  // "1 Person", singular. `guests > 1` in the component gave the right French
  // ("0 personne") and the wrong German, which is the fifth instance of that
  // exact rule in this effort.
  await expect.poll(() => screen.getByTestId("booking-total").textContent).toContain("1 Person");
});

// #102. The four required fields say so, and an empty form is refused by the
// app in the page's language rather than by the browser in its own.
test("marks the four required fields, and refuses an empty form in French", async () => {
  const user = userEvent.setup();
  let posted = false;
  server.use(
    http.post("/api/v1/events/:id/registrations", () => {
      posted = true;
      return HttpResponse.json({}, { status: 201 });
    }),
  );
  await renderBooking();

  expect(screen.getByLabelText("Téléphone")).toBeRequired();
  expect(screen.getByLabelText("Adresse")).not.toBeRequired();

  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  expect(screen.getByText("Nom est requis")).toBeInTheDocument();
  expect(screen.getByText("Téléphone est requis")).toBeInTheDocument();
  expect(screen.getByLabelText("Nom", { exact: true })).toHaveFocus();
  expect(posted).toBe(false);
});

test("says what the Table field is for, on the field itself", async () => {
  await renderBooking();
  expect(screen.getByLabelText("Table")).toHaveAccessibleDescription(
    "Avec qui vous aimeriez être placé.",
  );
});

test("a quantity out of range is refused against its own option", async () => {
  const user = userEvent.setup();
  await renderBooking();
  await fillInContact(user);
  await order(user, /Repas adulte/, 99);
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  expect(screen.getByLabelText(/Repas adulte/)).toHaveAccessibleDescription(
    "Repas adulte n'est pas un nombre valide",
  );
  expect(screen.getByLabelText(/Repas adulte/)).toHaveFocus();
});
