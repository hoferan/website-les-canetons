import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { InscriptionsUtilisateurs } from "./InscriptionsUtilisateurs";

const app = (
  <Routes>
    <Route path="/inscriptions_utilisateurs" element={<InscriptionsUtilisateurs />} />
    <Route path="/sinscrire" element={<p>Liste</p>} />
  </Routes>
);

test("it names the event being answered, which the old page did not", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=1" });
  expect(await screen.findByText(/Concert d'automne/)).toBeInTheDocument();
});

test("the member's own username is shown and not editable", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=1" });
  const username = await screen.findByLabelText("Identifiant de l’utilisateur :");
  expect(username).toHaveValue("demo.user");
  expect(username).toHaveAttribute("readonly");
});

test("answering returns to the list", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=1" });

  await user.selectOptions(await screen.findByLabelText("Participation :"), "participate");
  await user.click(screen.getByRole("button", { name: "Confirmer" }));

  expect(await screen.findByText("Liste")).toBeInTheDocument();
});

// A hand-typed or stale URL must not post garbage and must not render an empty
// form that looks answerable.
test("a missing id says so in French rather than posting", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Aucun événement");
  expect(screen.queryByRole("button", { name: "Confirmer" })).toBeNull();
});

test("an unknown id says so rather than showing a blank form", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=9999" });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Aucun événement"));
});
