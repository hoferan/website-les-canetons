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

// The read-only username input this used to assert is GONE. It was an input
// nobody could edit, holding a value the header already shows on every page.

test("answering takes one tap and returns to the list", async () => {
  const user = userEvent.setup();
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=1" });

  await user.click(await screen.findByRole("button", { name: "Je participe" }));

  expect(await screen.findByText("Liste")).toBeInTheDocument();
});

// A hand-typed or stale URL must not post garbage and must not render an empty
// form that looks answerable.
test("a missing id says so in French rather than posting", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs" });
  expect(await screen.findByRole("alert")).toHaveTextContent("Aucun événement");
  expect(screen.queryByRole("button", { name: "Je participe" })).toBeNull();
});

test("an unknown id says so rather than showing a blank form", async () => {
  setMockUser("demo.user");
  await renderWithSession(app, { route: "/inscriptions_utilisateurs?id=9999" });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Aucun événement"));
});
