import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { expect, test, vi } from "vitest";

import { ScrollToTop } from "./ScrollToTop";

/** Renders the current location as text, so a test can `findByText` it to know
 * a same-pathname navigation (hash-only, search-only) actually landed —
 * neither one remounts the route, so there is otherwise nothing to await. */
function ShowLocation() {
  const location = useLocation();
  return <p data-testid="location">{location.pathname + location.search + location.hash}</p>;
}

/**
 * A throwaway route pair, in the manner of guards.test.tsx's ShowState: one
 * page linking to another (a pathname change), plus links that change only
 * the hash or only the search string off the same page.
 */
function Harness() {
  return (
    <>
      <ScrollToTop />
      <ShowLocation />
      <Routes>
        <Route
          path="/a"
          element={
            <>
              <Link to="/b">to b</Link>
              <Link to="/a#section">to hash</Link>
              <Link to="/a?tab=2">to search only</Link>
            </>
          }
        />
        <Route path="/b" element={<p>page b</p>} />
      </Routes>
    </>
  );
}

test("navigating from one pathname to another scrolls to the top", async () => {
  const spy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/a"]}>
      <Harness />
    </MemoryRouter>,
  );

  spy.mockClear();
  await user.click(screen.getByText("to b"));
  await screen.findByText("page b");

  expect(spy).toHaveBeenCalledWith(0, 0);
});

test("navigating to a URL with a hash does not scroll to the top", async () => {
  const spy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/a"]}>
      <Harness />
    </MemoryRouter>,
  );

  spy.mockClear();
  await user.click(screen.getByText("to hash"));
  await screen.findByText("/a#section");

  expect(spy).not.toHaveBeenCalled();
});

test("a change to the search string alone does not scroll to the top", async () => {
  const spy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/a"]}>
      <Harness />
    </MemoryRouter>,
  );

  spy.mockClear();
  await user.click(screen.getByText("to search only"));
  await screen.findByText("/a?tab=2");

  expect(spy).not.toHaveBeenCalled();
});
