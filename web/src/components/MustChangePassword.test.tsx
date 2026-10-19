import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { MustChangePassword } from "./MustChangePassword";

/**
 * A miniature route table: the gate is a layout route, so it needs children to
 * decide between.
 */
function tree() {
  return (
    <Routes>
      <Route element={<MustChangePassword />}>
        <Route path="/" element={<h1>Accueil</h1>} />
        <Route path="/account" element={<h1>Mon compte</h1>} />
        <Route path="/account/password" element={<h1>Mot de passe</h1>} />
      </Route>
    </Routes>
  );
}

test("lets an ordinary member through", async () => {
  setMockUser("demo.direction");
  await renderWithSession(tree(), { route: "/" });

  expect(await screen.findByRole("heading", { name: "Accueil" })).toBeInTheDocument();
});

test("lets an anonymous visitor through", async () => {
  // Not an auth guard: a public page must not depend on being logged in.
  await renderWithSession(tree(), { route: "/" });

  expect(await screen.findByRole("heading", { name: "Accueil" })).toBeInTheDocument();
});

test("sends a member who must change their password to /account/password", async () => {
  setMockUser("demo.mustchange");
  await renderWithSession(tree(), { route: "/" });

  expect(await screen.findByRole("heading", { name: "Mot de passe" })).toBeInTheDocument();
});

test("does not redirect /account/password to itself", async () => {
  setMockUser("demo.mustchange");
  // An unconditional redirect would send the page to itself and render nothing.
  await renderWithSession(tree(), { route: "/account/password" });

  expect(await screen.findByRole("heading", { name: "Mot de passe" })).toBeInTheDocument();
});

// #125: only the password page is exempt; the rest of /account is a profile.
test("does not exempt the rest of /account", async () => {
  setMockUser("demo.mustchange");
  await renderWithSession(tree(), { route: "/account" });

  expect(await screen.findByRole("heading", { name: "Mot de passe" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Mon compte" })).toBeNull();
});
