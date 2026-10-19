import { screen } from "@testing-library/react";
import { Route, Routes, useLocation } from "react-router-dom";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { RequirePermission } from "./guards";

/**
 * Stands in for the login page and reports the router state it was handed,
 * since `from` is not observable from the path.
 */
function Whereabouts() {
  const { state } = useLocation();
  return <p data-testid="from">{(state as { from?: string } | null)?.from ?? ""}</p>;
}

/**
 * A miniature route table: the guard is a layout route, so it needs children
 * to decide between.
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

  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Connexion" })).toBeNull();
});

test("gives the refusal a heading, a gutter and a way out", async () => {
  setMockUser("demo.player");
  const { container } = await renderWithSession(tree(), { route: "/members" });

  // A refusal is a real page, so checking the string is in the DOM is not
  // enough: it needs a heading for anyone navigating by heading.
  expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Accès refusé");

  // Announced, since the route changed without a navigation.
  expect(screen.getByRole("alert")).toBeInTheDocument();

  expect(screen.getByRole("link", { name: /accueil/i })).toHaveAttribute("href", "/");

  // The shell, which is what carries the gutter.
  expect(container.querySelector("section.px-4")).not.toBeNull();
});

test("remembers where an anonymous visitor was going", async () => {
  await renderWithSession(
    <Routes>
      <Route element={<RequirePermission permission="events.view" />}>
        <Route path="/events" element={<p>Le planning</p>} />
      </Route>
      <Route path="/login" element={<Whereabouts />} />
    </Routes>,
    { route: "/events?past=1" },
  );

  expect(await screen.findByTestId("from")).toHaveTextContent("/events?past=1");
});

/**
 * The refusal in German.
 *
 * This is a whole screen, not the `access_denied` error token translateApiError
 * renders inside a form: heading, explanation and a way out, each its own key.
 * A member who cannot read the refusal cannot tell it from a broken site.
 */
test("refuses in German, with the same heading, alert and way out", async () => {
  setMockUser("demo.player");
  await renderWithSession(
    <Routes>
      <Route path="/login" element={<h1>Anmelden</h1>} />
      <Route element={<RequirePermission permission="members.manage" />}>
        <Route path="/members" element={<h1>Mitglieder</h1>} />
      </Route>
    </Routes>,
    { route: "/members", locale: "de-CH" },
  );

  expect(await screen.findByRole("heading", { name: "Zugriff verweigert" })).toBeInTheDocument();
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Diese Seite ist anderen Mitgliedern vorbehalten.",
  );
  // common.backHome, shared with NotFound.
  expect(screen.getByRole("link", { name: "Zurück zur Startseite" })).toHaveAttribute("href", "/");
});
