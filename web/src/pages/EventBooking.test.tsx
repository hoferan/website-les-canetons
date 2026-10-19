import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { beforeEach, expect, onTestFinished, test, vi } from "vitest";

import { type Locale } from "../i18n/locale";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { celebrate } from "../carnival/celebrate";
import { EventBooking } from "./EventBooking";

vi.mock("../carnival/celebrate", () => ({ celebrate: vi.fn() }));

beforeEach(() => {
  vi.mocked(celebrate).mockClear();
});

/** The seeded souper, the only event in the mocked planning that takes bookings. */
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

  // The per-booking cap is stated before somebody types seven.
  expect(screen.getByText(/au maximum 6 personnes/)).toBeInTheDocument();
});

/**
 * The one option with no price at all.
 *
 * `priceCents: null` means the price is not stated here, which is not the
 * same as free.
 */
test("an option with no price says nothing rather than claiming to be free", async () => {
  await renderBooking();

  const label = screen.getByText(/Sans repas/);
  expect(label).not.toHaveTextContent("CHF");
});

/**
 * The running total, which is why prices are integers on the wire: a guest
 * reads what a choice costs before submitting.
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

  // Read back from the server's answer, not the form's state, so the screen,
  // the guest list and the confirmation mail cannot disagree.
  const summary = screen.getByTestId("booking-summary");
  expect(within(summary).getByText("2 × Repas adulte")).toBeInTheDocument();
  expect(within(summary).getByText("3 × Repas enfant")).toBeInTheDocument();

  // The form is gone, not covered: a live form under the success panel
  // invites a second booking of the same people.
  expect(screen.queryByLabelText("Prénom")).not.toBeInTheDocument();

  // Confetti for the guest who has just booked, once.
  expect(celebrate).toHaveBeenCalledTimes(1);
});

/**
 * The confirmation replaces a form several screens long, and the window keeps
 * the submit button's offset. Focus on the h1 is what a screen reader
 * announces; the scroll is what everyone else sees.
 */
test("brings the confirmation into view and moves focus to its heading", async () => {
  const user = userEvent.setup();
  const scrollTo = vi.spyOn(window, "scrollTo");
  onTestFinished(() => scrollTo.mockRestore());
  await renderBooking();

  await fillInContact(user);
  await order(user, /Repas adulte/, 2);
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  const heading = await screen.findByRole("heading", { name: "Inscription enregistrée" });
  expect(heading).toHaveFocus();
  expect(scrollTo).toHaveBeenCalledWith(0, 0);
});

/**
 * The three protections, asserted on the wire: `registrationStore` compiles
 * without its third argument, so only the request proves the screen passes
 * `publicWriteHeaders`. Same test as the contact form's.
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
      // A real RegistrationResource: the success view renders the server's
      // answer, so a stub of the wrong shape crashes it.
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
  // Present and empty: a body that omits it is refused like one that fills it
  // in, so a hand-written POST cannot skip the guard by leaving it out.
  expect(sent!.website).toBe("");
});

/**
 * The cap, refused by the server against `choices` and rendered there.
 *
 * The token takes no parameters: the closure validator that raises it emits
 * field and reason only, so a string interpolating the maximum would print a
 * literal {{max}}.
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

  // The form stays open and keeps what was typed.
  expect(screen.getByLabelText("Prénom")).toHaveValue("Aline");
  expect(celebrate).not.toHaveBeenCalled();
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
 * Mutation test: render the form whenever `closesAt` is in the future and this
 * fails. `open` is computed by the server, so a browser with a wrong clock
 * cannot offer a form that is refused on submit.
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
        opensAt: "2099-10-03T00:00:00.000Z",
        closesAt: "2099-11-14T23:00:00.000Z",
        open: false,
      }),
    ),
  );

  await renderBooking();

  expect(screen.getByText("Les inscriptions ouvrent le 3 octobre 2099.")).toBeInTheDocument();
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
 * The public form in German
 * -------------------------------------------------------------------------- */

test("the public booking form is German", async () => {
  // The field array holds `labelKey`, not `label`: a module-scope label is
  // frozen at import, before any locale is chosen.
  await renderBooking(SOUPER, "de-CH");

  expect(screen.getByLabelText("Name")).toBeInTheDocument();
  expect(screen.getByLabelText("Vorname")).toBeInTheDocument();
  expect(screen.getByLabelText("E-Mail")).toBeInTheDocument();
  expect(screen.getByLabelText("Telefon")).toBeInTheDocument();
  expect(screen.getByLabelText("Tisch")).toBeInTheDocument();

  expect(screen.getByRole("group", { name: "Ihre Kontaktangaben" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Anmelden" })).toBeInTheDocument();

  // Mutation test: put `label` back on the array and these read French.
  expect(screen.queryByLabelText("Prénom")).toBeNull();

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

  // "1 Person", singular, from the catalogue: a `guests > 1` rule is French
  // and wrong in German.
  await expect.poll(() => screen.getByTestId("booking-total").textContent).toContain("1 Person");
});

test("the confirmation counts the guests in German", async () => {
  const user = userEvent.setup();
  await renderBooking(SOUPER, "de-CH");

  await user.type(screen.getByLabelText("Name"), "Muster");
  await user.type(screen.getByLabelText("Vorname"), "Anna");
  await user.type(screen.getByLabelText("E-Mail"), "anna@example.ch");
  await user.type(screen.getByLabelText("Telefon"), "079 000 00 00");
  await user.type(screen.getAllByRole("spinbutton")[0] as HTMLElement, "1");
  await user.click(screen.getByRole("button", { name: "Anmelden" }));

  await screen.findByTestId("booking-summary");

  // From the catalogue, like the running total: "personne" plus an "s" above
  // one is the French rule.
  expect(screen.getByTestId("booked-guests")).toHaveTextContent(/^1 Person — CHF/);
  expect(screen.queryByText(/personne/)).toBeNull();
});

// The four required fields say so, and an empty form is refused by the app in
// the page's language, not by the browser in its own.
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

  expect(screen.getByText("Nom est obligatoire")).toBeInTheDocument();
  expect(screen.getByText("Téléphone est obligatoire")).toBeInTheDocument();
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
