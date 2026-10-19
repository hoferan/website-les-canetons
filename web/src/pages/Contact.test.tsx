import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, onTestFinished, test, vi } from "vitest";

import { problem, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Contact } from "./Contact";

type User = ReturnType<typeof userEvent.setup>;

/**
 * Pastes each value into the field with that label. Typing re-renders the form
 * once per key, and a whole message can run out the 5 s test timeout in a
 * loaded full-suite run. No test here is about keystrokes.
 */
async function fill(user: User, values: Record<string, string>) {
  for (const [label, value] of Object.entries(values)) {
    await user.click(screen.getByLabelText(label));
    await user.paste(value);
  }
}

/** Fills every visible field with something the API would accept. */
async function fillIn(user: User) {
  await fill(user, {
    Nom: "Rossier",
    Prénom: "Claire",
    "E-mail": "claire@example.ch",
    Sujet: "Mon fils aimerait essayer",
    Message: "Bonjour, est-ce possible ?",
  });
}

/** The same values, on the German page. */
async function fillInGerman(user: User) {
  await fill(user, {
    Name: "Rossier",
    Vorname: "Claire",
    "E-Mail": "claire@example.ch",
    Betreff: "Mon fils aimerait essayer",
    Nachricht: "Bonjour, est-ce possible ?",
  });
}

test("sends the message and answers in place, without navigating", async () => {
  const user = userEvent.setup();
  await renderWithSession(<Contact />, { route: "/contact" });

  await fillIn(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  expect(await screen.findByRole("heading", { name: "Message envoyé" })).toBeInTheDocument();
  // The form is gone: a success panel above a live form invites a second send.
  expect(screen.queryByLabelText("Nom")).not.toBeInTheDocument();
});

/**
 * The sent panel replaces the form in place, and the window would keep the
 * submit button's offset, leaving the sender on the footer at 390px with
 * focus on <body>.
 */
test("brings the sent panel into view and moves focus to its heading", async () => {
  const user = userEvent.setup();
  const scrollTo = vi.spyOn(window, "scrollTo");
  onTestFinished(() => scrollTo.mockRestore());
  await renderWithSession(<Contact />, { route: "/contact" });

  await fillIn(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  const heading = await screen.findByRole("heading", { name: "Message envoyé" });
  expect(heading).toHaveFocus();
  expect(scrollTo).toHaveBeenCalledWith(0, 0);
});

/**
 * The guard's headers, asserted on the wire rather than on the helper that
 * builds them: `contactStore` compiles fine without its second argument.
 */
test("carries the form token and an idempotency key on the request itself", async () => {
  const user = userEvent.setup();
  let seen: Headers | null = null;
  server.use(
    http.post("/api/v1/contact", ({ request }) => {
      seen = request.headers;
      return HttpResponse.json({ ok: true });
    }),
  );

  await renderWithSession(<Contact />, { route: "/contact" });
  await fillIn(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  await screen.findByRole("heading", { name: "Message envoyé" });

  const headers = seen as Headers | null;
  expect(headers?.get("X-Form-Token")).toBe("mock-form-token");
  // The value is a fresh UUID every mount, so assert the API's minimum: a key
  // under 16 characters answers 400 idempotency_key_invalid.
  expect((headers?.get("Idempotency-Key") ?? "").length).toBeGreaterThanOrEqual(16);
});

/**
 * The honeypot must be sent and empty. An absent field is refused exactly
 * like a filled one, so not rendering it is no implementation.
 */
test("sends the honeypot present and empty, and hides it from assistive technology", async () => {
  const user = userEvent.setup();
  let body: Record<string, unknown> = {};
  server.use(
    http.post("/api/v1/contact", async ({ request }) => {
      body = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true });
    }),
  );

  await renderWithSession(<Contact />, { route: "/contact" });
  await fillIn(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  await screen.findByRole("heading", { name: "Message envoyé" });

  expect(body).toHaveProperty("website", "");
  // Out of the accessibility tree, so a screen reader never offers it.
  expect(screen.queryByLabelText(/website/i)).not.toBeInTheDocument();
});

test("shows the refusal in French when the guard rejects the submission", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/v1/contact", () =>
      problem(422, "spam_suspected", "Submission looks automated"),
    ),
  );

  await renderWithSession(<Contact />, { route: "/contact" });
  await fillIn(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  // FormError's region is always in the tree, empty until the refusal lands,
  // so wait for its text: findByRole("alert") would resolve on the empty one.
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Envoi refusé. Rechargez la page et réessayez.",
    ),
  );
  // No English reaches the screen: `title` is for a log.
  expect(screen.queryByText(/Submission looks automated/)).not.toBeInTheDocument();
});

test("keeps what was typed when the send fails", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/v1/contact", () =>
      problem(422, "spam_suspected", "Submission looks automated"),
    ),
  );

  await renderWithSession(<Contact />, { route: "/contact" });
  await fillIn(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Envoi refusé. Rechargez la page et réessayez.",
    ),
  );

  // A rejected message must not make someone retype it.
  expect(screen.getByLabelText("Sujet")).toHaveValue("Mon fils aimerait essayer");
});

/** Every field is required, `subject` included, as the API requires it. */
test("marks every field required, subject included", async () => {
  await renderWithSession(<Contact />, { route: "/contact" });

  for (const label of ["Nom", "Prénom", "E-mail", "Sujet", "Message"]) {
    expect(screen.getByLabelText(label)).toBeRequired();
  }
});

/**
 * A member usually has a faster route to the committee, but the site carries
 * no direct contact detail, so a member without the number has only this
 * form. It is signposted, never taken away.
 */
test("tells a member the committee is reachable directly, and leaves the form alone", async () => {
  setMockUser("demo.player");
  await renderWithSession(<Contact />, { route: "/contact" });

  expect(screen.getByText(/joignable directement/)).toBeInTheDocument();
  expect(screen.getByLabelText("Nom")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Envoyer" })).toBeInTheDocument();
});

test("says nothing of the sort to an anonymous visitor", async () => {
  await renderWithSession(<Contact />, { route: "/contact" });

  expect(screen.queryByText(/joignable directement/)).not.toBeInTheDocument();
  expect(screen.getByLabelText("Nom")).toBeInTheDocument();
});

test("renders the form in German and sends the message", async () => {
  const user = userEvent.setup();
  await renderWithSession(<Contact />, { route: "/contact", locale: "de-CH" });

  expect(screen.getByRole("heading", { name: "Kontakt" })).toBeInTheDocument();

  await fillInGerman(user);
  await user.click(screen.getByRole("button", { name: "Senden" }));

  expect(await screen.findByRole("heading", { name: "Nachricht gesendet" })).toBeInTheDocument();
});

test("shows the refusal in German when the guard rejects the submission", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/v1/contact", () =>
      problem(422, "spam_suspected", "Submission looks automated"),
    ),
  );

  await renderWithSession(<Contact />, { route: "/contact", locale: "de-CH" });
  await fillInGerman(user);
  await user.click(screen.getByRole("button", { name: "Senden" }));

  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Senden abgelehnt. Laden Sie die Seite neu und versuchen Sie es erneut.",
    ),
  );
});

// #102: validated by the app, so an English browser shows no "Please fill out
// this field." bubble of its own.
test("an empty submission is refused in French, before anything is sent", async () => {
  const user = userEvent.setup();
  let posted = false;
  server.use(
    http.post("/api/v1/contact", () => {
      posted = true;
      return HttpResponse.json({ ok: true });
    }),
  );

  await renderWithSession(<Contact />, { route: "/contact" });
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  expect(screen.getByText("Nom est obligatoire")).toBeInTheDocument();
  expect(screen.getByText("Message est obligatoire")).toBeInTheDocument();
  expect(screen.getByLabelText("Nom")).toHaveFocus();
  expect(posted).toBe(false);
});

test("an empty submission is refused in German on the German page", async () => {
  const user = userEvent.setup();
  await renderWithSession(<Contact />, { route: "/contact", locale: "de-CH" });
  await user.click(screen.getByRole("button", { name: "Senden" }));

  expect(screen.getByText("Name ist erforderlich")).toBeInTheDocument();
});

test("a malformed address is refused before anything is sent", async () => {
  const user = userEvent.setup();
  await renderWithSession(<Contact />, { route: "/contact" });
  await fillIn(user);
  await user.clear(screen.getByLabelText("E-mail"));
  await fill(user, { "E-mail": "claire" });
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  expect(screen.getByText("E-mail n'est pas dans un format valide")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Message envoyé" })).toBeNull();
});
