import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { MustChangePassword } from "./MustChangePassword";

/**
 * A miniature route table, because this gate is a layout route: what it does is
 * decide which of its children renders, and that is not observable without one.
 */
function tree() {
  return (
    <Routes>
      <Route element={<MustChangePassword />}>
        <Route path="/" element={<h1>Accueil</h1>} />
        <Route path="/account" element={<h1>Mon compte</h1>} />
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
  // It is NOT an auth guard. A public page must not depend on being logged in,
  // and R2 adds several.
  await renderWithSession(tree(), { route: "/" });

  expect(await screen.findByRole("heading", { name: "Accueil" })).toBeInTheDocument();
});

test("sends a member who must change their password to /account", async () => {
  setMockUser("demo.mustchange");
  await renderWithSession(tree(), { route: "/" });

  expect(await screen.findByRole("heading", { name: "Mon compte" })).toBeInTheDocument();
});

test("does not redirect /account to itself", async () => {
  setMockUser("demo.mustchange");
  // The loop this prevents: a gate that redirects unconditionally sends
  // /account to /account forever and the page never renders at all.
  await renderWithSession(tree(), { route: "/account" });

  expect(await screen.findByRole("heading", { name: "Mon compte" })).toBeInTheDocument();
});
