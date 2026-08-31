import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Signup } from "./Signup";

const app = (
  <Routes>
    <Route path="/signup" element={<Signup />} />
    <Route path="/signup_thanks" element={<h1>Merci pour votre inscription !</h1>} />
  </Routes>
);

const CONTACT: [string, string][] = [
  ["Prénom", "Ada"],
  ["Nom", "Lovelace"],
  ["Adresse", "Rue du Test 1, 1700 Fribourg"],
  ["Téléphone", "+41 79 000 00 00"],
  ["E-mail", "ada@example.com"],
  ["Table (nom de famille ou nom de table)", "Famille Lovelace"],
];

async function fillContact() {
  for (const [label, value] of CONTACT) {
    await userEvent.type(screen.getByLabelText(label, { exact: true }), value);
  }
}

test("the occasion copy comes from the config, not from the bundle", async () => {
  await renderWithSession(app, { route: "/signup" });

  expect(
    await screen.findByRole("heading", { name: "Souper des 25 ans des Canetons", level: 1 }),
  ).toBeInTheDocument();
  expect(screen.getByText(/Amis et familles, réservez votre place/)).toBeInTheDocument();
  // The menu cards are rendered from config.occasion.menus, so the prices are
  // never restated in the front end.
  expect(screen.getByText("CHF 45.–")).toBeInTheDocument();
});

// The honeypot must be present and must be submitted. If it stops being
// rendered, every bot that would have been trapped gets through instead.
test("the honeypot is present, hidden, and out of the tab order", async () => {
  await renderWithSession(app, { route: "/signup" });

  const trap = document.querySelector<HTMLInputElement>("input[name='website']");
  expect(trap).not.toBeNull();
  expect(trap).toHaveAttribute("tabindex", "-1");
  expect(trap?.closest("[aria-hidden='true']")).not.toBeNull();
});

/**
 * The test above proves the honeypot is RENDERED. This one proves it is SENT,
 * which is the half that actually stops a bot.
 *
 * It has to live here rather than in the e2e spec: a trapped submission is
 * answered with a plain `201 {ok:true}`, byte-identical to a real success, so
 * that a bot never learns it was caught (SignupController::store() step 1).
 * Playwright therefore lands on the thank-you page either way and can observe
 * no difference at all. The request body is the only evidence there is.
 *
 * Without this, deleting `hp` from the payload in Signup.tsx leaves the whole
 * suite green while every bot walks through.
 */
test("the honeypot's value is actually submitted", async () => {
  let sent: Record<string, unknown> = {};
  server.use(
    http.post("/api/signups", async ({ request }) => {
      sent = (await request.json()) as Record<string, unknown>;
      return HttpResponse.json({ ok: true }, { status: 201 });
    }),
  );

  await renderWithSession(app, { route: "/signup" });
  await fillContact();

  // A bot fills the field a human never sees.
  const trap = document.querySelector<HTMLInputElement>("input[name='website']");
  await userEvent.type(trap!, "bot");

  await userEvent.click(screen.getByRole("button", { name: "Envoyer l’inscription" }));

  await waitFor(() => expect(sent.hp).toBe("bot"));
  // The solved proof-of-work rides along on the same request; if it stopped
  // being sent the real API would answer 403 captcha_failed and the failure
  // would be diagnosed on the server rather than here.
  expect(typeof sent.altcha).toBe("string");
  expect(sent.first_name).toBe("Ada");
});

test("a complete reservation lands on the thank-you page", async () => {
  await renderWithSession(app, { route: "/signup" });
  await fillContact();

  await userEvent.click(screen.getByRole("button", { name: "Envoyer l’inscription" }));

  expect(
    await screen.findByRole("heading", { name: "Merci pour votre inscription !" }),
  ).toBeInTheDocument();
});

// The whole reason the form goes through useApiFormError rather than the old
// alert(): a rejection has to name the field it is about, in French.
test("an over-long field comes back in French against that input", async () => {
  await renderWithSession(app, { route: "/signup" });
  await fillContact();
  // Pasted rather than typed: the form is controlled, so userEvent.type
  // re-renders it once per keystroke and 256 of those overrun the default 5s
  // timeout — whose leaked, still-typing continuation then corrupts the next
  // test's input. The resulting value, and the assertion below, are unchanged.
  await userEvent.clear(screen.getByLabelText("Prénom", { exact: true }));
  await userEvent.click(screen.getByLabelText("Prénom", { exact: true }));
  await userEvent.paste("a".repeat(256));

  await userEvent.click(screen.getByRole("button", { name: "Envoyer l’inscription" }));

  const field = await screen.findByLabelText("Prénom", { exact: true });
  await waitFor(() => expect(field).toHaveAttribute("aria-invalid", "true"));
  const described = field.getAttribute("aria-describedby");
  expect(described).not.toBeNull();
  expect(document.getElementById(described as string)).toHaveTextContent(
    /Prénom est trop long \(maximum 255 caractères\)/,
  );
});

// The values must survive a rejection: a reservation is a lot of typing.
test("a rejection does not clear what was typed", async () => {
  await renderWithSession(app, { route: "/signup" });
  await fillContact();
  await userEvent.clear(screen.getByLabelText("Téléphone", { exact: true }));

  await userEvent.click(screen.getByRole("button", { name: "Envoyer l’inscription" }));

  await screen.findByRole("alert");
  expect(screen.getByLabelText("Prénom", { exact: true })).toHaveValue("Ada");
  expect(screen.getByLabelText("Adresse", { exact: true })).toHaveValue(
    "Rue du Test 1, 1700 Fribourg",
  );
});
