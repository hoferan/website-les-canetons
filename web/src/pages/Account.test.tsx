import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Account } from "./Account";

async function change(current: string, next: string, confirmation = next) {
  await userEvent.type(screen.getByLabelText("Mot de passe actuel"), current);
  await userEvent.type(screen.getByLabelText("Nouveau mot de passe"), next);
  await userEvent.type(screen.getByLabelText("Confirmer le nouveau mot de passe"), confirmation);
  await userEvent.click(screen.getByRole("button", { name: "Changer le mot de passe" }));
}

test("changes the password and says so", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account" });
  await change("demo", "un-mot-de-passe");

  // findByText: the role="status" region is always in the tree (see
  // Account.tsx), so findByRole would resolve against an empty div before the
  // mutation lands.
  expect(await screen.findByText("Votre mot de passe a été changé.")).toBeInTheDocument();
});

test("catches a mistyped confirmation without asking the API", async () => {
  let attempts = 0;
  server.use(
    http.post("/api/v1/me/password", () => {
      attempts++;
      return HttpResponse.json({ ok: true });
    }),
  );

  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account" });
  await change("demo", "un-mot-de-passe", "un-mot-de-pass");

  // A client-side check, and one of the few French strings a component may
  // write itself: the API knows nothing about a confirmation field, so there is
  // no token to translate. Checking it here also means a typo costs no
  // round-trip and burns no attempt against the re-authentication throttle.
  expect(
    await screen.findByText("Les deux mots de passe ne correspondent pas."),
  ).toBeInTheDocument();
  expect(attempts).toBe(0);
});

test("reports a wrong current password in French", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account" });
  await change("pas-le-bon", "un-mot-de-passe");

  expect(
    await screen.findByText(
      "Mot de passe incorrect. Cette action doit être confirmée par votre mot de passe.",
    ),
  ).toBeInTheDocument();
});

test("reports a too-short password with the minimum, not a placeholder", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account" });
  await change("demo", "court");

  const problem = await screen.findByText(/trop court/);
  // The regression this guards: 'too_short' interpolates {{min}}, and i18next
  // prints a missing interpolation value LITERALLY. If the API ever stops
  // sending params.min, the member reads "minimum {{min}} caractères".
  expect(problem).toHaveTextContent("minimum 8 caractères");
  expect(problem).not.toHaveTextContent("{{min}}");
});

test("explains the forced change rather than just refusing to leave", async () => {
  setMockUser("demo.mustchange");
  await renderWithSession(<Account />, { route: "/account" });

  expect(
    await screen.findByText(/mot de passe.*doit être remplacé|doit être remplacé/i),
  ).toBeInTheDocument();
});

test("says nothing about a forced change to a member who has none", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account" });

  // demo.direction's mustChangePassword is false in the mock, so the notice
  // must be absent — the page is also the ordinary "change my password" screen.
  //
  // Asserted on the TEXT, not on queryByRole("alert"): FormError keeps an empty
  // role="alert" in the tree at all times, so "no alert element" is never true
  // on this page and that assertion would fail for a reason that has nothing to
  // do with the notice.
  expect(screen.queryByText(/doit être remplacé/i)).toBeNull();
});

/**
 * The notice the gate owes the reader. `MustChangePassword` bounces a member
 * here with no explanation of its own, so without this paragraph the site
 * simply refuses to go anywhere and says nothing about why. Untested until
 * 2026-09-18, and written down now because it moved to the shared `Notice`
 * component on that date.
 */
test("explains why a committee-issued password bounced the member here", async () => {
  setMockUser("demo.both");
  await renderWithSession(<Account />, { route: "/account" });

  expect(
    screen.getByText(
      "Votre mot de passe a été fourni par le comité et doit être remplacé avant de continuer.",
    ),
  ).toBeInTheDocument();
});

/**
 * The German side of the password form.
 *
 * Every string on this screen is asserted, because this is the one page a
 * member with a committee-issued password CANNOT LEAVE until they have read it
 * and acted on it. A single French sentence left here is a dead end for the
 * reader this locale exists for.
 */
test("labels all three fields and the submit in German", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account", locale: "de-CH" });

  expect(screen.getByRole("heading", { name: "Mein Konto" })).toBeInTheDocument();
  expect(screen.getByLabelText("Aktuelles Passwort")).toHaveAttribute(
    "autocomplete",
    "current-password",
  );
  expect(screen.getByLabelText("Neues Passwort")).toHaveAttribute("autocomplete", "new-password");
  expect(screen.getByLabelText("Neues Passwort bestätigen")).toHaveAttribute(
    "autocomplete",
    "new-password",
  );
  expect(screen.getByRole("button", { name: "Passwort ändern" })).toBeInTheDocument();
});

async function changeInGerman(current: string, next: string, confirmation = next) {
  await userEvent.type(screen.getByLabelText("Aktuelles Passwort"), current);
  await userEvent.type(screen.getByLabelText("Neues Passwort"), next);
  await userEvent.type(screen.getByLabelText("Neues Passwort bestätigen"), confirmation);
  await userEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));
}

test("confirms the change in German", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account", locale: "de-CH" });
  await changeInGerman("demo", "ein-neues-passwort");

  expect(await screen.findByText("Ihr Passwort wurde geändert.")).toBeInTheDocument();
});

test("catches a mistyped confirmation in German, still without asking the API", async () => {
  let attempts = 0;
  server.use(
    http.post("/api/v1/me/password", () => {
      attempts++;
      return HttpResponse.json({ ok: true });
    }),
  );

  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account", locale: "de-CH" });
  await changeInGerman("demo", "ein-neues-passwort", "ein-neues-passwor");

  // The API has no confirmation field, so this sentence is the screen's own
  // rather than a translated error token — which is exactly the kind of string
  // that gets left behind in French when a page is translated.
  expect(
    await screen.findByText("Die beiden Passwörter stimmen nicht überein."),
  ).toBeInTheDocument();
  expect(attempts).toBe(0);
});

test("reports a wrong current password in German", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account", locale: "de-CH" });
  await changeInGerman("nicht-das-richtige", "ein-neues-passwort");

  expect(
    await screen.findByText(
      "Falsches Passwort. Diese Aktion muss mit Ihrem Passwort bestätigt werden.",
    ),
  ).toBeInTheDocument();
});

test("explains a committee-issued password in German", async () => {
  setMockUser("demo.both");
  await renderWithSession(<Account />, { route: "/account", locale: "de-CH" });

  expect(
    screen.getByText(
      "Ihr Passwort wurde vom Vorstand ausgegeben und muss ersetzt werden, bevor Sie fortfahren.",
    ),
  ).toBeInTheDocument();
});
