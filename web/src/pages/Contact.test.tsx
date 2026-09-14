import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { problem } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Contact } from "./Contact";

/** Fills every visible field with something the API would accept. */
async function fillIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nom:"), "Rossier");
  await user.type(screen.getByLabelText("Prénom:"), "Claire");
  await user.type(screen.getByLabelText("E-mail:"), "claire@example.ch");
  await user.type(screen.getByLabelText("Sujet:"), "Mon fils aimerait essayer");
  await user.type(screen.getByLabelText("Contenu du message:"), "Bonjour, est-ce possible ?");
}

test("sends the message and answers in place, without navigating", async () => {
  const user = userEvent.setup();
  await renderWithSession(<Contact />, { route: "/contact" });

  await fillIn(user);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  expect(await screen.findByRole("heading", { name: "Message envoyé" })).toBeInTheDocument();
  // The form is GONE, not merely covered: a success panel above a live form
  // invites a second send of the same message.
  expect(screen.queryByLabelText("Nom:")).not.toBeInTheDocument();
});

/**
 * THE THREE HEADERS THE GUARD REQUIRES, asserted on the wire rather than on
 * the helper that builds them. `publicWriteHeaders` returning the right object
 * proves nothing if the screen forgets to pass it — which is the whole failure
 * mode, since `contactStore` compiles perfectly well without its second
 * argument.
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
  // Not the value — that is a fresh UUID every mount — but the window the API
  // enforces. A key under 16 characters answers 400 idempotency_key_invalid.
  expect((headers?.get("Idempotency-Key") ?? "").length).toBeGreaterThanOrEqual(16);
});

/**
 * The honeypot must be SENT and EMPTY. An absent field is refused exactly like
 * a filled one, so "we just don't render it" is not an implementation of this.
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
  // Nothing a person can reach: not in the accessibility tree, so a
  // screen-reader user is never asked to leave a field blank.
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

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Envoi refusé. Rechargez la page et réessayez.",
  );
  // NOTHING English reaches the screen: `title` is for a log.
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
  await screen.findByRole("alert");

  // A rejected message must not make someone retype it.
  expect(screen.getByLabelText("Sujet:")).toHaveValue("Mon fils aimerait essayer");
});

/**
 * Every field is required, `subject` included — which the legacy markup was
 * not, even though the API has always required it.
 */
test("marks every field required, subject included", async () => {
  await renderWithSession(<Contact />, { route: "/contact" });

  for (const label of ["Nom:", "Prénom:", "E-mail:", "Sujet:", "Contenu du message:"]) {
    expect(screen.getByLabelText(label)).toBeRequired();
  }
});
