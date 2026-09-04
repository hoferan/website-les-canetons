import { screen } from "@testing-library/react";
import { expect, test } from "vitest";
import { Route, Routes, useLocation } from "react-router-dom";

import { setMockUser } from "../mocks/handlers";
import { renderWithSession } from "../test/renderWithSession";
import { RequireCapability } from "./guards";

/** Renders whatever the guard put in router state, so a test can read it. */
function ShowState() {
  const { state } = useLocation();
  return <p data-testid="from">{(state as { from?: string } | null)?.from ?? "(none)"}</p>;
}

const SECRET = "contenu réservé";
const secret = <p>{SECRET}</p>;

// The negative cases are the point of this file. The capability matrix is NOT a
// hierarchy — admin organises events but does not vote in them — and every
// intuition about roles says otherwise, so both directions are pinned.
test("a user may respond", async () => {
  setMockUser("demo.user");
  await renderWithSession(<RequireCapability capability="respond">{secret}</RequireCapability>);
  expect(await screen.findByText(SECRET)).toBeInTheDocument();
});

test("a moderator may respond", async () => {
  setMockUser("demo.moderator");
  await renderWithSession(<RequireCapability capability="respond">{secret}</RequireCapability>);
  expect(await screen.findByText(SECRET)).toBeInTheDocument();
});

test("an admin may NOT respond", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<RequireCapability capability="respond">{secret}</RequireCapability>);
  expect(screen.queryByText(SECRET)).toBeNull();
  expect(screen.getByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
});

test("an admin may manage events", async () => {
  setMockUser("demo.admin");
  await renderWithSession(
    <RequireCapability capability="manage_events">{secret}</RequireCapability>,
  );
  expect(await screen.findByText(SECRET)).toBeInTheDocument();
});

test("a user may NOT manage events", async () => {
  setMockUser("demo.user");
  await renderWithSession(
    <RequireCapability capability="manage_events">{secret}</RequireCapability>,
  );
  expect(screen.queryByText(SECRET)).toBeNull();
  expect(screen.getByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
});

// A refusal, not a redirect: bouncing someone already logged in to a login form
// reads as "your session expired" and invites them to log in again at something
// they will never be allowed to see.
test("a logged-in user without the capability is refused in place, not redirected", async () => {
  setMockUser("demo.user");
  await renderWithSession(
    <RequireCapability capability="manage_events">{secret}</RequireCapability>,
  );
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

// A REFUSAL IS A PAGE, AND THIS FILE USED TO PROVE ONLY THAT IT WAS A STRING.
// Every assertion above is on getByRole("alert") having the right text, and all
// of them were true of a bare `<p role="alert">` that carried no heading and sat
// outside the page shell — so at 390px the words hit the left edge with no
// gutter, and a screen reader navigating by heading found an empty document.
// Four green tests over a visible defect. Assert the structure, not the string.
test("a refusal has a heading, so the page is not empty to a screen reader", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<RequireCapability capability="respond">{secret}</RequireCapability>);
  expect(await screen.findByRole("heading", { name: "Accès refusé" })).toBeInTheDocument();
});

// The refusal is a dead end unless it offers one, and the visitor is logged in
// and legitimate: they followed a link to something their role does not cover.
test("a refusal offers a way out", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<RequireCapability capability="respond">{secret}</RequireCapability>);
  expect(await screen.findByRole("link", { name: /accueil/i })).toHaveAttribute("href", "/");
});

test("an anonymous visitor is redirected rather than shown a refusal", async () => {
  await renderWithSession(
    <RequireCapability capability="manage_events">{secret}</RequireCapability>,
  );
  expect(screen.queryByText(SECRET)).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

// The bounce has to carry the attempted location, or a guard sends everyone to
// the home page after login and the deep link they clicked is lost. Asserted on
// the rendered Location rather than on the guard's internals: what matters is
// what the router receives.
test("RequireCapability carries the location too, query string included", async () => {
  await renderWithSession(
    <Routes>
      <Route
        path="/admin"
        element={<RequireCapability capability="manage_events">{secret}</RequireCapability>}
      />
      <Route path="/authentification_inscription" element={<ShowState />} />
    </Routes>,
    { route: "/admin?tab=events" },
  );
  expect(await screen.findByTestId("from")).toHaveTextContent("/admin?tab=events");
});
