import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Route, Routes, useLocation } from "react-router-dom";
import { expect, test } from "vitest";

import { renderWithSession } from "../test/renderWithSession";
import { Link, Navigate, useNavigate } from "./routing";

test("a link on a German page stays German", async () => {
  await renderWithSession(
    <>
      <Link to="/join">Mitmachen</Link>
      <Link to="/">Start</Link>
    </>,
    { locale: "de-CH" },
  );

  expect(screen.getByRole("link", { name: "Mitmachen" })).toHaveAttribute("href", "/de/join");
  expect(screen.getByRole("link", { name: "Start" })).toHaveAttribute("href", "/de");
});

test("a link on a French page has no prefix", async () => {
  await renderWithSession(<Link to="/join?x=1#y">Rejoindre</Link>);

  expect(screen.getByRole("link", { name: "Rejoindre" })).toHaveAttribute("href", "/join?x=1#y");
});

test("a link can name the language it opens in", async () => {
  await renderWithSession(
    <Link to="/join" locale="de-CH">
      Deutsch
    </Link>,
  );

  expect(screen.getByRole("link", { name: "Deutsch" })).toHaveAttribute("href", "/de/join");
});

test("a relative link is resolved against the page, then put in its language", async () => {
  await renderWithSession(
    <Routes>
      <Route path="/events/:id" element={<Link to="edit">Bearbeiten</Link>} />
    </Routes>,
    { locale: "de-CH", route: "/events/7" },
  );

  expect(screen.getByRole("link", { name: "Bearbeiten" })).toHaveAttribute(
    "href",
    "/de/events/7/edit",
  );
});

function GoToEvents() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate("/events")}>
      Go
    </button>
  );
}

test("navigate() stays in the page's language", async () => {
  const { router } = await renderWithSession(<GoToEvents />, {
    locale: "de-CH",
    route: "/account",
  });

  await userEvent.click(screen.getByRole("button", { name: "Go" }));

  expect(router.state.location.pathname).toBe("/de/events");
});

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

test("a redirect stays in the page's language", async () => {
  const { router } = await renderWithSession(
    <Routes>
      <Route path="/old" element={<Navigate to="/login" replace />} />
      <Route path="*" element={<Where />} />
    </Routes>,
    { locale: "de-CH", route: "/old" },
  );

  await waitFor(() => expect(router.state.location.pathname).toBe("/de/login"));
  // The page itself sees the path without the language.
  expect(screen.getByTestId("where")).toHaveTextContent("/login");
});
