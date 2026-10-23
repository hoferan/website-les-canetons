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
          choices: [
            {
              optionId: 1,
              kind: "quantity",
              label: "Repas adulte",
              quantity: 1,
              value: null,
              answerLabel: null,
              priceCents: 4500,
            },
          ],
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

/**
 * Another guest booking through the mocked API, as if from another browser,
 * so the count moves under a form that is already open.
 */
async function somebodyElseBooks(optionId: number, quantity: number) {
  const response = await fetch(`/api/v1/events/${SOUPER}/registrations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Form-Token": "mock-form-token",
      "Idempotency-Key": crypto.randomUUID(),
    },
    body: JSON.stringify({
      firstName: "Autre",
      lastName: "Invité",
      email: "autre@example.ch",
      phone: "079 111 11 11",
      choices: [{ optionId, quantity }],
      website: "",
    }),
  });
  expect(response.status).toBe(201);
}

/** The children's meal: a capacity of 6, with 3 booked in the seed. */
const CHILDREN = 2;

test("says how many places are left, and only under an option that has a limit", async () => {
  await renderBooking();

  expect(screen.getByLabelText(/Repas enfant/)).toHaveAccessibleDescription("Plus que 3 places");
  expect(screen.getByLabelText(/Repas adulte/)).not.toHaveAccessibleDescription();
  expect(screen.getAllByTestId("places-left")).toHaveLength(1);
});

test("a sold-out option is shown as such, and cannot be chosen", async () => {
  await somebodyElseBooks(CHILDREN, 3);
  await renderBooking();

  expect(screen.getByText("Complet")).toBeInTheDocument();
  expect(screen.getByLabelText(/Repas enfant/)).toBeDisabled();
});

/**
 * The race the lock is there for, seen from the guest: the form said three
 * were left, somebody took two meanwhile, and the server refuses against the
 * line that ran out and the form re-reads the count.
 */
test("places taken meanwhile are refused against that option, and the count is read again", async () => {
  const user = userEvent.setup();
  await renderBooking();

  await fillInContact(user);
  await order(user, /Repas adulte/, 1);
  await order(user, /Repas enfant/, 2);
  await somebodyElseBooks(CHILDREN, 2);
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  const children = screen.getByLabelText(/Repas enfant/);
  await expect.poll(() => children).toHaveAccessibleDescription(/dépasse les places encore libres/);
  await expect.poll(() => children).toHaveAccessibleDescription(/Plus qu’une place/);
  // Only the line that ran out.
  expect(screen.getByLabelText(/Repas adulte/)).not.toHaveAccessibleDescription();
  expect(screen.getByLabelText("Prénom")).toHaveValue("Aline");
  expect(celebrate).not.toHaveBeenCalled();
});

test("the places left are counted in German", async () => {
  await renderBooking(SOUPER, "de-CH");

  expect(screen.getByText("Noch 3 Plätze frei")).toBeInTheDocument();
});

/**
 * An option that sells out while the guest has it chosen. Its box is
 * disabled, so the guest could not clear it: the quantity has to leave the
 * total and the next submit by itself, or every retry is refused again.
 */
test("an option that sells out under the guest drops out of the booking", async () => {
  const user = userEvent.setup();
  await renderBooking();

  await fillInContact(user);
  await order(user, /Repas adulte/, 1);
  await order(user, /Repas enfant/, 3);
  await somebodyElseBooks(CHILDREN, 3);
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  await screen.findByText("Complet");
  expect(screen.getByLabelText(/Repas enfant/)).toHaveValue(null);
  expect(screen.getByTestId("booking-total")).toHaveTextContent("1 personne — CHF 45.00");

  await user.click(screen.getByRole("button", { name: "M’inscrire" }));
  await expect.poll(() => vi.mocked(celebrate).mock.calls.length).toBe(1);
});

test("shows every block of the form in order, each as its kind", async () => {
  await renderBooking();

  expect(screen.getByRole("heading", { name: "Pour la cuisine" })).toBeInTheDocument();

  const veggie = screen.getByRole("group", { name: "Végétarien ?" });
  expect(within(veggie).getByRole("radio", { name: "Oui" })).toBeInTheDocument();
  expect(within(veggie).getByRole("radio", { name: "Non" })).toBeInTheDocument();

  const dessert = screen.getByRole("group", { name: "Dessert" });
  expect(within(dessert).getByRole("radio", { name: "Tiramisu" })).toBeInTheDocument();

  expect(screen.getByRole("textbox", { name: "Allergies" })).toHaveAccessibleDescription(
    "Laissez vide si aucune",
  );
});

test("sends each answered block as a value, and leaves out the ones left alone", async () => {
  const user = userEvent.setup();
  let choices: unknown = null;
  server.use(
    http.post("/api/v1/events/:id/registrations", async ({ request }) => {
      choices = ((await request.json()) as { choices: unknown }).choices;
      return HttpResponse.json({}, { status: 500 });
    }),
  );
  await renderBooking();

  await fillInContact(user);
  await order(user, /Repas adulte/, 2);
  await user.click(
    within(screen.getByRole("group", { name: "Végétarien ?" })).getByRole("radio", {
      name: "Oui",
    }),
  );
  await user.click(screen.getByRole("radio", { name: "Tiramisu" }));
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  await expect.poll(() => choices).not.toBeNull();
  expect(choices).toEqual([
    { optionId: 1, quantity: 2 },
    { optionId: 5, value: "yes" },
    { optionId: 6, value: "tiramisu" },
  ]);
});

test("the confirmation lists the answers beside the order", async () => {
  const user = userEvent.setup();
  await renderBooking();

  await fillInContact(user);
  await order(user, /Repas adulte/, 1);
  await user.click(screen.getByRole("radio", { name: "Tiramisu" }));
  await user.type(screen.getByRole("textbox", { name: "Allergies" }), "Noix");
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  const summary = await screen.findByTestId("booking-summary");
  expect(within(summary).getByText("1 × Repas adulte")).toBeInTheDocument();
  expect(within(summary).getByText("Dessert : Tiramisu")).toBeInTheDocument();
  expect(within(summary).getByText("Allergies : Noix")).toBeInTheDocument();
});

/** A form of questions only, such as a picnic list: nobody to count. */
function questionsOnly() {
  server.use(
    http.get("/api/v1/events/:id/registration", () =>
      HttpResponse.json({
        event: {
          id: SOUPER,
          title: "Pique-nique",
          startsAt: "2027-06-12T10:00:00.000Z",
          endsAt: null,
          location: "Lac de la Gruyère",
        },
        options: [
          {
            id: 40,
            kind: "text",
            label: "Que nous apportez-vous ?",
            description: null,
            required: true,
            countsGuests: false,
            answers: [],
            priceCents: null,
            capacity: null,
            remaining: null,
            sortOrder: 0,
          },
        ],
        maxGuests: null,
        opensAt: null,
        closesAt: "2027-06-01T00:00:00.000Z",
        open: true,
      }),
    ),
  );
}

test("a form with nobody to count asks for no one and states no total", async () => {
  questionsOnly();
  await renderBooking();

  expect(screen.queryByText("Choisissez au moins une personne.")).not.toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: /Que nous apportez-vous/ })).toBeRequired();
});

test("a required block the server says is missing is marked on that block", async () => {
  const user = userEvent.setup();
  questionsOnly();
  server.use(
    http.post("/api/v1/events/:id/registrations", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "Bad Request",
          status: 400,
          detail: "Invalid form submission",
          instance: "/api/v1/events/7/registrations",
          code: "validation_failed",
          errors: [{ field: "answers.40", reason: "required" }],
        },
        { status: 400 },
      ),
    ),
  );
  await renderBooking();

  await fillInContact(user);
  await user.type(screen.getByRole("textbox", { name: /Que nous apportez-vous/ }), "Un gâteau");
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  expect(await screen.findByText("Merci de répondre à cette question.")).toBeInTheDocument();
});

/** The souper's form with one block replaced, to test a single kind. */
function formWith(option: Record<string, unknown>, form: Record<string, unknown> = {}) {
  server.use(
    http.get("/api/v1/events/:id/registration", () =>
      HttpResponse.json({
        event: {
          id: SOUPER,
          title: "Pique-nique",
          startsAt: "2027-06-12T10:00:00.000Z",
          endsAt: null,
          location: "Lac de la Gruyère",
        },
        options: [
          {
            id: 41,
            description: null,
            required: true,
            countsGuests: false,
            answers: [],
            priceCents: null,
            capacity: null,
            remaining: null,
            sortOrder: 0,
            ...option,
          },
        ],
        maxGuests: null,
        opensAt: null,
        closesAt: "2027-06-01T00:00:00.000Z",
        open: true,
        asksAddress: true,
        asksTable: true,
        ...form,
      }),
    ),
  );
}

test("a required yes/no left unanswered says so, and nothing is sent", async () => {
  const user = userEvent.setup();
  let posted = false;
  server.use(
    http.post("/api/v1/events/:id/registrations", () => {
      posted = true;
      return HttpResponse.json({}, { status: 201 });
    }),
  );
  formWith({ kind: "yes_no", label: "Vous venez en car ?" });
  await renderBooking();

  await fillInContact(user);
  await user.click(screen.getByRole("button", { name: "M’inscrire" }));

  expect(
    within(screen.getByRole("group", { name: /Vous venez en car/ })).getByText(
      "Merci de répondre à cette question.",
    ),
  ).toBeInTheDocument();
  expect(posted).toBe(false);
});

test("a required quantity is marked and required like a contact field", async () => {
  formWith({ kind: "quantity", label: "Personnes", countsGuests: true });
  await renderBooking();

  expect(screen.getByLabelText(/Personnes/)).toBeRequired();
  expect(screen.getByText("Personnes").closest("label")).toHaveTextContent("*");
});

test("a form that does not ask for the address or the table shows neither field", async () => {
  formWith(
    { kind: "text", label: "Que nous apportez-vous ?", required: false },
    {
      asksAddress: false,
      asksTable: false,
    },
  );
  await renderBooking();

  expect(screen.queryByLabelText("Adresse")).not.toBeInTheDocument();
  expect(screen.queryByLabelText("Table", { exact: true })).not.toBeInTheDocument();
  // The three a committee always needs stay.
  expect(screen.getByLabelText("Téléphone")).toBeRequired();
});
