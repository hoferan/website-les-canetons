import { screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Account } from "./Account";

/**
 * Who you are, before what you can change (#100). Read from the card by its
 * labels, so a value printed under the wrong label fails.
 */
function field(label: string): string {
  const card = screen.getByRole("region", { name: /identité|identität/i });
  const term = within(card).getByText(label, { selector: "dt" });
  return term.nextElementSibling?.textContent ?? "";
}

test("shows who the member is: name, identifiant, pupitre, seat and roles", async () => {
  setMockUser("demo.committee");
  await renderWithSession(<Account />, { route: "/account" });

  const card = screen.getByRole("region", { name: "Identité" });
  expect(within(card).getByText("Camille Committee")).toBeInTheDocument();
  expect(field("Identifiant")).toBe("demo.committee");
  expect(field("Pupitre")).toBe("Trombones");
  expect(field("Fonction au comité")).toBe("Responsable intendance");
  // Translated by key through roleLabel, never the raw key.
  expect(field("Rôles")).toBe("Comité");
});

test("says so when the member sits on no committee seat and holds no role", async () => {
  setMockUser("demo.young");
  await renderWithSession(<Account />, { route: "/account" });

  expect(field("Fonction au comité")).toBe("Aucune");
  expect(field("Rôles")).toBe("Aucun");
});

test("says so when the member plays in no register", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Account />, { route: "/account" });

  expect(field("Pupitre")).toBe("Ne joue pas");
});

test("shows the identity card in German", async () => {
  setMockUser("demo.committee");
  await renderWithSession(<Account />, { route: "/account", locale: "de-CH" });

  expect(screen.getByRole("region", { name: "Identität" })).toBeInTheDocument();
  expect(field("Benutzername")).toBe("demo.committee");
  expect(field("Register")).toBe("Trombones");
  expect(field("Funktion im Vorstand")).toBe("Responsable intendance");
  expect(field("Rollen")).toBe("Vorstand");
});

/**
 * #125: changing the password is rare, so it gets one row and a button, and
 * the form lives on its own page. Asserting the absence of every password
 * field is what stops the form creeping back onto this page.
 */
test("offers the password change as a link to its own page, with no field here", async () => {
  setMockUser("demo.player");
  await renderWithSession(<Account />, { route: "/account" });

  const row = screen.getByRole("region", { name: "Mot de passe" });
  expect(within(row).getByRole("link", { name: "Changer le mot de passe" })).toHaveAttribute(
    "href",
    "/account/password",
  );
  expect(document.querySelector('input[type="password"]')).toBeNull();
});

test("offers the password change in German", async () => {
  setMockUser("demo.player");
  await renderWithSession(<Account />, { route: "/account", locale: "de-CH" });

  const row = screen.getByRole("region", { name: "Passwort" });
  expect(within(row).getByRole("link", { name: "Passwort ändern" })).toBeInTheDocument();
});
