import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { beforeEach, expect, onTestFinished, test, vi } from "vitest";

import { type Locale } from "../i18n/locale";
import { problem, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { EventRegistrations } from "./EventRegistrations";

/** The seeded souper, the only event with bookings against it. */
const SOUPER = 7;

/**
 * jsdom implements neither half of a download: `URL.createObjectURL` is
 * undefined and clicking an anchor navigates nowhere. Stubbed, because these
 * tests are about which request is made and what happens when it is refused.
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

/** The guest list. */
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
    choices: choices.map((choice) => ({
      ...choice,
      kind: "quantity",
      value: null,
      answerLabel: null,
      priceCents: 4500,
    })),
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

  // Two bookings, six people and CHF 150.00: the second booking took only an
  // unpriced option, so it adds people and no money.
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
 * A booking whose options carry no price owes an unknown amount, not zero.
 */
test("leaves the total empty for a booking of unpriced options", async () => {
  await renderGuestList();

  // Found by the order, not `includes("Python")`: Jeanne's seeded table
  // preference is "Avec la famille Python".
  const marc = cardFor("1 × Sans repas");

  expect(marc).toHaveTextContent("Python Marc");
  expect(marc).not.toHaveTextContent("CHF");
});

/**
 * The two permissions on one screen: `demo.committee` holds
 * `registrations.view` but not `registrations.manage`.
 *
 * Mutation test: render the row actions unconditionally and this fails.
 */
test("a viewer gets the list and no way to change it", async () => {
  await renderGuestList("demo.committee");

  expect(within(cards()).getByText(/Aebischer/)).toBeInTheDocument();
  // queryAllByRole: a lost gate brings back one control per booking, and the
  // singular query would throw "found multiple elements" instead of failing
  // on the count (as `expectNoSuchAction` in Events.test.tsx).
  //
  // A page-wide query works only because two actions draw no menu. A third
  // action would put them in a closed menu, whose items are not in the DOM,
  // and make this assertion vacuous.
  expect(screen.queryAllByRole("button", { name: /^Corriger/ })).toHaveLength(0);
  expect(screen.queryAllByRole("button", { name: /^Annuler l’inscription/ })).toHaveLength(0);
});

test("somebody who may manage gets both controls on every row", async () => {
  await renderGuestList();

  // Once: a second layout would double this count first.
  expect(
    screen.getAllByRole("button", { name: "Corriger l’inscription de Jeanne Aebischer" }),
  ).toHaveLength(1);
});

/**
 * The conditional write, quoting the tag of the read the form opened with.
 *
 * Mutation test: drop `ifMatch(etag)` from the PATCH and this fails with the
 * mocked backend's 428, as the real API would answer.
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

  // The panel closes only on a successful write, so its absence is the
  // assertion that the write went through.
  await expect.poll(() => screen.queryByLabelText("Téléphone")).toBeNull();
  // The amended number, as a link dialled in E.164.
  expect(
    within(cardFor("Aebischer Jeanne")).getByRole("link", { name: "079 999 99 99" }),
  ).toHaveAttribute("href", "tel:+41799999999");
});

/**
 * What was ordered is not editable, matching the API, whose PATCH has no
 * `choices` field, and the panel says so.
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
 * Cancelling asks for the surname to be typed, because the guest is not
 * notified and cannot re-book once the window has shut.
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
  // The developer formats are one step further away, and still there.
  await user.click(screen.getByText("Autres formats"));
  for (const label of ["Markdown", "JSON"]) {
    await user.click(screen.getByRole("button", { name: label }));
  }

  await expect.poll(() => asked).toEqual(["xlsx", "csv", "md", "json"]);
});

test("Markdown and JSON are not beside Excel at equal weight", async () => {
  await renderGuestList();

  // Inside a closed <details>: in the DOM, not visible. Mutation test: move
  // them into FORMATS and both assertions fail.
  expect(screen.getByRole("button", { name: "Excel" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Markdown", hidden: true })).not.toBeVisible();
  expect(screen.getByRole("button", { name: "JSON", hidden: true })).not.toBeVisible();
});

/* ---------------------------------------------------------------------------
 * The kitchen view
 * -------------------------------------------------------------------------- */

test("tells the kitchen how many of each option were booked", async () => {
  await renderGuestList();

  // Jeanne took 2 adult and 3 child meals, Marc one "Sans repas". Mutation
  // test: count bookings instead of summing quantities and the first entry
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

/** Jeanne's payment switch, by the name a screen reader and voice control use. */
function jeannePaid() {
  return within(cardFor("Aebischer Jeanne")).getByRole("switch", {
    name: "Payé : inscription de Jeanne Aebischer",
  });
}

test("flipping Payé records the payment, quoting a tag, and the list shows it", async () => {
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

  expect(jeannePaid()).not.toBeChecked();

  await user.click(jeannePaid());

  await expect.poll(() => screen.getByTestId("guest-counts")).toHaveTextContent("1 sur 1 payée");
  expect(jeannePaid()).toBeChecked();
  expect(sent).toEqual([{ body: { paid: true }, ifMatch: expect.stringMatching(/^"[0-9a-f]+"$/) }]);

  // And back: the same switch takes the payment back, with no dialog.
  await user.click(jeannePaid());

  await expect.poll(() => screen.getByTestId("guest-counts")).toHaveTextContent("0 sur 1 payée");
  expect(jeannePaid()).not.toBeChecked();
  expect(sent[1]).toEqual({ body: { paid: false }, ifMatch: expect.stringMatching(/^"/) });
});

/**
 * Somebody else recorded the payment after this list loaded; flipping the
 * stale switch on must keep it paid, not take it back.
 *
 * Mutation test: send the opposite of the fresh read instead of what the
 * switch says, and this fails.
 */
test("flipping Payé on sends paid, even when somebody recorded it meanwhile", async () => {
  const user = userEvent.setup();
  await renderGuestList();

  const jeanneId = 1;
  const read = await fetch(`/api/v1/registrations/${jeanneId}`);
  expect(((await read.json()) as { lastName: string }).lastName).toBe("Aebischer");
  await fetch(`/api/v1/registrations/${jeanneId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", "If-Match": read.headers.get("ETag") ?? "" },
    body: JSON.stringify({ paid: true }),
  });

  const sent: unknown[] = [];
  const record = ({ request }: { request: Request }) => {
    if (request.method === "PATCH") {
      void request
        .clone()
        .json()
        .then((body: unknown) => sent.push(body));
    }
  };
  server.events.on("request:start", record);
  onTestFinished(() => server.events.removeListener("request:start", record));

  expect(jeannePaid()).not.toBeChecked();
  await user.click(jeannePaid());

  await expect.poll(() => screen.getByTestId("guest-counts")).toHaveTextContent("1 sur 1 payée");
  expect(sent).toEqual([{ paid: true }]);
  expect(jeannePaid()).toBeChecked();
});

/**
 * Mutation test, three guards. Drop the `finally` that clears the optimistic
 * value and the switch stays on after the refusal; drop the card's alert and
 * the refusal is never read; drop the early return while busy and the second
 * click turns the switch off mid-save.
 */
test("a refused payment puts the switch back and says why on the card", async () => {
  const user = userEvent.setup();
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.patch("/api/v1/registrations/:id", async () => {
      await held;
      return problem(412, "if_match_failed", "The If-Match header does not match");
    }),
  );

  await renderGuestList();

  await user.click(jeannePaid());

  // On while the write is in flight, and deaf to a second flip.
  expect(jeannePaid()).toBeChecked();
  expect(jeannePaid()).toHaveAttribute("aria-disabled", "true");
  expect(jeannePaid()).toBeEnabled();
  await user.click(jeannePaid());
  expect(jeannePaid()).toBeChecked();

  release();

  expect(await within(cardFor("Aebischer Jeanne")).findByRole("alert")).toHaveTextContent(
    /modifié cet élément entre-temps/,
  );
  expect(jeannePaid()).not.toBeChecked();
  expect(jeannePaid()).toHaveAttribute("aria-disabled", "false");
  expect(screen.getByTestId("guest-counts")).toHaveTextContent("0 sur 1 payée");
});

test("a booking with no price has no payment to record", async () => {
  await renderGuestList();

  expect(within(cardFor("1 × Sans repas")).queryByTestId("payment")).toBeNull();
});

/**
 * A switch somebody cannot move reads as broken, so a viewer gets the pill.
 * Mutation test: render the switch for a viewer as well and this fails.
 */
test("a viewer reads who has paid from a pill, with no switch", async () => {
  await renderGuestList("demo.committee");

  expect(within(cardFor("Aebischer Jeanne")).getByTestId("payment")).toHaveTextContent("Non payé");
  expect(screen.queryAllByRole("switch")).toHaveLength(0);
});

test("the payment switch is named in German too", async () => {
  await renderGuestList("demo.direction", SOUPER, "de-CH");

  expect(
    within(cardFor("Aebischer Jeanne")).getByRole("switch", {
      name: "Bezahlt: Anmeldung von Jeanne Aebischer",
    }),
  ).not.toBeChecked();
});

test("the cancel dialog's way out does not also say Annuler", async () => {
  const user = userEvent.setup();
  await renderGuestList();

  await user.click(
    within(cards()).getByRole("button", { name: "Annuler l’inscription de Jeanne Aebischer" }),
  );

  const dialog = await screen.findByRole("alertdialog");
  // Mutation test: drop dismissLabel and the first assertion fails.
  expect(within(dialog).queryByRole("button", { name: "Annuler" })).toBeNull();
  await user.click(within(dialog).getByRole("button", { name: "Garder l’inscription" }));

  await expect.poll(() => screen.queryByRole("alertdialog")).toBeNull();
  expect(within(cards()).getByText(/Aebischer/)).toBeInTheDocument();
});

/**
 * A server without ext-zip answers `503 xlsx_unavailable`, and CSV still
 * works there. The download goes through fetch because a plain
 * `<a download>` would save the problem document as an .xlsx file.
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

  // A straight apostrophe, which fr.ts's error catalogue uses throughout,
  // unlike the typographic one in the page copy. The wrong character fails as
  // "unable to find the text", which looks like a missing message.
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

  expect(cardFor("Aebischer Jeanne")).toHaveTextContent("Route des Alpes 12, 1700 Fribourg");
});

test("a card's e-mail and phone are tappable and its address is not", async () => {
  await renderGuestList();

  const card = cardFor("Aebischer Jeanne");
  const links = within(card).getAllByRole("link");

  // Corriger and Annuler are buttons, so the only links on the card are these.
  expect(links).toHaveLength(2);
  expect(links[0]).toHaveAttribute("href", "mailto:jeanne.aebischer@example.ch");
  // The API's E.164 reading, not the typed text: see ContactLink.
  expect(links[1]).toHaveAttribute("href", "tel:+41791234567");
  // No geo: link or maps URL: a free-text address makes a wrong pin.
  expect(within(card).queryByRole("link", { name: /Route des Alpes/ })).toBeNull();
});

test("the contact block reads as three separate facts, not one run-on string", async () => {
  await renderGuestList();

  const stack = within(cardFor("Aebischer Jeanne")).getByTestId("guest-contact");

  // Asserted positively: a lone `querySelector("br")` null check passes on an
  // empty block and on a single text node.
  expect(stack.children).toHaveLength(3);
  expect(stack.children[0]).toHaveTextContent("jeanne.aebischer@example.ch");
  expect(stack.children[1]).toHaveTextContent("079 123 45 67");
  expect(stack.children[2]).toHaveTextContent("Route des Alpes 12, 1700 Fribourg");
  expect(stack.querySelector("br")).toBeNull();
});

test("a booking with no address gets two lines, not an empty third", async () => {
  await renderGuestList();

  // Marc Python's address is null. Render it unconditionally and this fails.
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

  // The presence half matters: the absence alone also passes when the
  // override never applied or the row never rendered.
  const card = cardFor("Aebischer");

  expect(within(card).getByText("à demander")).toBeInTheDocument();
  expect(within(card).queryByRole("link", { name: "à demander" })).toBeNull();
});

/* ---------------------------------------------------------------------------
 * The guest list in German
 * -------------------------------------------------------------------------- */

test("both counts pluralise in German, and the total groups the German way", async () => {
  await renderGuestList("demo.direction", SOUPER, "de-CH");

  // The heading and the per-card count carry no accent, so a grep for French
  // misses them; only the rendered page shows them.
  expect(screen.getByRole("heading", { level: 1, name: "Anmeldungen" })).toBeInTheDocument();

  const counts = screen.getByTestId("guest-counts");
  expect(counts).toHaveTextContent("2 Anmeldungen");
  expect(counts).toHaveTextContent("6 Personen");

  const first = within(screen.getByTestId("guest-cards")).getAllByRole(
    "listitem",
  )[0] as HTMLElement;
  expect(first).toHaveTextContent("5 Personen");
  expect(first).toHaveTextContent("Tisch:");

  // The group separator follows the locale (Swiss German uses the
  // apostrophe). 150.00 has none, so money.test.ts holds the real assertion;
  // this only proves the screen uses the locale-aware formatter.
  expect(counts).toHaveTextContent("CHF");
});

test("the two Annulers become two different German words", async () => {
  // The row button cancels a booking; the amend form's button closes the form
  // without doing anything. French calls both "Annuler".
  //
  // Mutation test: point registrations.cancel at common.cancel and the first
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

  // Two keys: the button labels and the dialog asks, so only the dialog ends
  // in a question mark (spaced in French).
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveAccessibleName(`Anmeldung von ${name} stornieren?`);
  expect(button.getAttribute("aria-label")).toBe(`Anmeldung von ${name} stornieren`);

  expect(within(dialog).getByRole("button", { name: "Anmeldung stornieren" })).toBeInTheDocument();
});

test("a booking's answers appear on its card, under the order", async () => {
  await renderGuestList();

  const answers = within(cardFor("Aebischer Jeanne")).getByTestId("guest-answers");
  expect(
    within(answers)
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["Végétarien ? : Non", "Dessert : Meringue et double crème"]);
  // The order line keeps the quantities only.
  expect(cardFor("Aebischer Jeanne")).toHaveTextContent("2 × Repas adulte, 3 × Repas enfant");
});

test("the totals count each answer of a choice and a yes/no", async () => {
  await renderGuestList();

  const totals = within(screen.getByTestId("answer-totals")).getAllByRole("listitem");
  expect(totals.map((item) => item.textContent)).toEqual([
    "Végétarien ? : 1 × Non",
    "Dessert : 1 × Meringue et double crème",
  ]);
  // And the kitchen's quantities stay as they were.
  expect(
    within(screen.getByTestId("option-totals"))
      .getAllByRole("listitem")
      .map((item) => item.textContent),
  ).toEqual(["2 × Repas adulte", "3 × Repas enfant", "1 × Sans repas"]);
});

test("a list that counts nobody states no number of people", async () => {
  server.use(
    http.get("*/api/v1/events/:id/registrations", () =>
      HttpResponse.json({
        data: [
          {
            ...booking(1, "Aebischer", []),
            choices: [
              {
                optionId: 40,
                kind: "text",
                label: "Que nous apportez-vous ?",
                quantity: null,
                value: "Un gâteau",
                answerLabel: null,
                priceCents: null,
              },
            ],
            guestCount: 0,
            totalCents: null,
          },
        ],
        meta: { total: 1, limit: 500, offset: 0 },
      }),
    ),
  );

  await renderGuestList();

  expect(screen.getByTestId("guest-counts")).toHaveTextContent("1 inscription");
  expect(screen.getByTestId("guest-counts")).not.toHaveTextContent("personne");
  expect(cardFor("Aebischer Test")).not.toHaveTextContent("personne");
  expect(cardFor("Aebischer Test")).toHaveTextContent("Que nous apportez-vous ? : Un gâteau");
});
