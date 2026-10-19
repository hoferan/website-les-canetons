import { screen, within } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, test } from "vitest";

import { currentMockUser, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { Account } from "./Account";

/** Reads a value by its label, so a value under the wrong label fails. */
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
  // Translated by key through roleName, never the raw key.
  expect(field("Rôles")).toBe("Comité, Membre, Musicien·ne");
});

test("says so when the member sits on no committee seat", async () => {
  setMockUser("demo.young");
  await renderWithSession(<Account />, { route: "/account" });

  expect(field("Fonction au comité")).toBe("Aucune");
  expect(field("Rôles")).toBe("Membre, Musicien·ne");
});

test("says so when the session holds no role at all", async () => {
  // Every seeded persona holds the baseline role, so the empty list is forced.
  setMockUser("demo.young");
  server.use(
    http.get("/api/v1/me", () =>
      HttpResponse.json({ ...currentMockUser(), roles: [], permissions: [] }),
    ),
  );
  await renderWithSession(<Account />, { route: "/account" });

  expect(field("Rôles")).toBe("Aucun");
});

test("names a role by what the committee typed, in the page's language", async () => {
  // A role made in the editor has no catalogue entry; its key would read
  // `custom-01h…`.
  setMockUser("demo.young");
  server.use(
    http.get("/api/v1/me", () =>
      HttpResponse.json({
        ...currentMockUser(),
        roles: [
          { key: "member", labelFr: null, labelDe: null },
          { key: "custom-01abc", labelFr: "Photographes", labelDe: "Fotografen" },
        ],
      }),
    ),
  );
  await renderWithSession(<Account />, { route: "/account", locale: "de-CH" });

  expect(field("Rollen")).toBe("Mitglied, Fotografen");
});

test("says so when the member is in no register, without claiming they do not play", async () => {
  // A register is display only (#192). Ulysse holds musician and answers
  // events in no register, so "Ne joue pas" would be wrong for him.
  setMockUser("demo.unplaced");
  await renderWithSession(<Account />, { route: "/account" });

  expect(field("Pupitre")).toBe("Aucun pupitre");
});

test("shows the identity card in German", async () => {
  setMockUser("demo.committee");
  await renderWithSession(<Account />, { route: "/account", locale: "de-CH" });

  expect(screen.getByRole("region", { name: "Identität" })).toBeInTheDocument();
  expect(field("Benutzername")).toBe("demo.committee");
  expect(field("Register")).toBe("Trombones");
  expect(field("Funktion im Vorstand")).toBe("Responsable intendance");
  expect(field("Rollen")).toBe("Vorstand, Mitglied, Musiker·in");
});

/** The absence of any password field keeps the form off this page. */
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
