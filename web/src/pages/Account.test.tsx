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
    http.post("/api/me/password", () => {
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
