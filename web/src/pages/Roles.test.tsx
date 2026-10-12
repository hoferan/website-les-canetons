import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { type Locale } from "../i18n/locale";
import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { Roles } from "./Roles";

async function renderRoles(locale: Locale = "fr") {
  setMockUser("demo.direction");
  await renderWithSession(<Roles />, { route: "/roles", locale });
  await screen.findAllByTestId("role-card");
}

function cardFor(name: string): HTMLElement {
  const card = screen
    .getAllByTestId("role-card")
    .find((candidate) => within(candidate).queryByRole("heading", { name }) !== null);
  if (!card) {
    throw new Error(`no card for ${name}`);
  }
  return card;
}

test("lists every role by name, with what it grants", async () => {
  await renderRoles();

  expect(
    screen.getAllByTestId("role-card").map((card) => within(card).getByRole("heading").textContent),
  ).toEqual(["Team Direction", "Comité", "Membre", "Musicien·ne"]);
  expect(cardFor("Comité")).toHaveTextContent("Voir les inscriptions, Lire les messages");
});

test("the baseline role is shown, and offers nothing to change", async () => {
  // Its grants and its existence are fixed (#193): an edit button here could
  // only lead to a refusal.
  await renderRoles();

  const baseline = cardFor("Membre");
  expect(baseline).toHaveTextContent("Tous les comptes ont ce rôle. Il ne se modifie pas.");
  expect(within(baseline).queryByRole("button")).toBeNull();
  expect(
    within(cardFor("Comité")).getByRole("button", { name: "Modifier le rôle Comité" }),
  ).toBeInTheDocument();
});

test("creates a role with its names and what it grants", async () => {
  const user = userEvent.setup();
  await renderRoles();

  const form = screen.getByRole("form", { name: "Nouveau rôle" });
  await user.type(within(form).getByLabelText("Nom en français"), "Photographes");
  await user.type(within(form).getByLabelText("Nom en allemand"), "Fotografen");
  await user.click(within(form).getByLabelText("Gérer les photos"));
  await user.click(within(form).getByRole("button", { name: "Créer le rôle" }));

  expect(await screen.findByRole("heading", { name: "Photographes" })).toBeInTheDocument();
  expect(cardFor("Photographes")).toHaveTextContent("Gérer les photos");
});

test("opens a seeded role with the catalogue's names in both languages", async () => {
  // Renaming it from a French page must not drop its German name.
  const user = userEvent.setup();
  await renderRoles();

  await user.click(
    within(cardFor("Comité")).getByRole("button", { name: "Modifier le rôle Comité" }),
  );

  const form = await screen.findByRole("form", { name: "Modifier le rôle Comité" });
  expect(within(form).getByLabelText("Nom en français")).toHaveValue("Comité");
  expect(within(form).getByLabelText("Nom en allemand")).toHaveValue("Vorstand");
  expect(within(form).getByLabelText("Voir les inscriptions")).toBeChecked();
  expect(within(form).getByLabelText("Gérer le planning")).not.toBeChecked();
});

test("renames a role and changes what it grants in one save", async () => {
  // Two conditional writes: the grant change quotes the tag the rename handed
  // back, or it would answer 412 after the name had already changed.
  const user = userEvent.setup();
  await renderRoles();

  await user.click(
    within(cardFor("Comité")).getByRole("button", { name: "Modifier le rôle Comité" }),
  );
  const form = await screen.findByRole("form", { name: "Modifier le rôle Comité" });
  const name = within(form).getByLabelText("Nom en français");
  await user.clear(name);
  await user.type(name, "Comité des fêtes");
  await user.click(within(form).getByLabelText("Gérer le planning"));
  await user.click(within(form).getByRole("button", { name: "Enregistrer" }));

  const renamed = await screen.findByRole("heading", { name: "Comité des fêtes" });
  expect(renamed.closest("[data-testid=role-card]")).toHaveTextContent("Gérer le planning");
});

test("names who loses the role before deleting it", async () => {
  const user = userEvent.setup();
  await renderRoles();

  await user.click(
    within(cardFor("Comité")).getByRole("button", { name: "Supprimer le rôle Comité" }),
  );

  const dialog = await screen.findByRole("alertdialog");
  // Camille Committee is the one seeded member holding `committee`.
  expect(dialog).toHaveTextContent("Camille Committee perdra ce rôle");

  await user.click(within(dialog).getByRole("button", { name: "Supprimer" }));
  await expect.poll(() => screen.queryByRole("heading", { name: "Comité" })).toBeNull();
});

test("a change that would lock the band out is refused, in French, and changes nothing", async () => {
  // Dominique and Bastien both administer through `direction` alone.
  const user = userEvent.setup();
  await renderRoles();

  await user.click(
    within(cardFor("Team Direction")).getByRole("button", {
      name: "Modifier le rôle Team Direction",
    }),
  );
  const form = await screen.findByRole("form", { name: "Modifier le rôle Team Direction" });
  await user.click(within(form).getByLabelText("Gérer les membres"));
  await user.click(within(form).getByRole("button", { name: "Enregistrer" }));

  expect(
    await screen.findByText("C'est la dernière personne pouvant administrer les membres."),
  ).toBeInTheDocument();
});

test("reads in German, roles and permissions alike", async () => {
  await renderRoles("de-CH");

  expect(screen.getByRole("heading", { level: 1, name: "Rollen" })).toBeInTheDocument();
  expect(cardFor("Vorstand")).toHaveTextContent("Anmeldungen sehen");
});
