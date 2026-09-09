import { screen } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { RequirePermission } from "./guards";

/**
 * A miniature route table. The guard is a layout route, so what it does is
 * decide which of its children renders — not observable without one.
 */
function tree() {
  return (
    <Routes>
      <Route path="/login" element={<h1>Connexion</h1>} />
      <Route element={<RequirePermission permission="members.manage" />}>
        <Route path="/members" element={<h1>Membres</h1>} />
      </Route>
    </Routes>
  );
}

test("renders the page for a member who holds the permission", async () => {
  setMockUser("demo.direction");
  await renderWithSession(tree(), { route: "/members" });

  expect(await screen.findByRole("heading", { name: "Membres" })).toBeInTheDocument();
});

test("sends an anonymous visitor to the login page", async () => {
  await renderWithSession(tree(), { route: "/members" });

  expect(await screen.findByRole("heading", { name: "Connexion" })).toBeInTheDocument();
});

test("refuses a logged-in member IN PLACE rather than bouncing them to login", async () => {
  setMockUser("demo.player");
  await renderWithSession(tree(), { route: "/members" });

  // Bouncing somebody who is already logged in to a login form reads as "your
  // session expired" and invites them to log in again, repeatedly, at
  // something they will never be allowed to see.
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Connexion" })).toBeNull();
});

test("gives the refusal a heading, a gutter and a way out", async () => {
  setMockUser("demo.player");
  const { container } = await renderWithSession(tree(), { route: "/members" });

  // A refusal is a real page. This assertion exists because the previous
  // version of this guard rendered a bare <p role="alert"> with no heading — an
  // empty document to anyone navigating by heading — outside PageSection, so at
  // 390px the words sat flush against the left edge. Four tests passed over it
  // for weeks because they only checked the string was in the DOM.
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Accès refusé");

  // The refusal is ANNOUNCED: the route changed without a navigation, and a
  // screen-reader user who hears nothing has no idea why the page they asked
  // for is not there.
  expect(screen.getByRole("alert")).toBeInTheDocument();

  // A way out, not a dead end.
  expect(screen.getByRole("link", { name: /accueil/i })).toHaveAttribute("href", "/");

  // The shell, which is what carries the gutter.
  expect(container.querySelector("section.px-4")).not.toBeNull();
});
