import { render, screen, waitFor } from "@testing-library/react";
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
              <Link to="/a#missing">to missing hash</Link>
              <Link to="/a?tab=2">to search only</Link>
              {/* The target of "to hash" above. Present from the start, like
                  Canetons.tsx's register sections: SessionProvider gates the
                  whole router, so a real page's target element is already in
                  the DOM by the time this effect runs — this harness mirrors
                  that instead of mounting the element asynchronously. */}
              <div id="section">section content</div>
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

test("navigating to a hash whose element exists scrolls that element into view", async () => {
  // setupTests.ts installs a no-op Element.prototype.scrollIntoView so this
  // is spy-able at all — jsdom does not implement it, not even as a stub.
  const spy = vi.spyOn(Element.prototype, "scrollIntoView").mockImplementation(() => {});
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/a"]}>
      <Harness />
    </MemoryRouter>,
  );

  spy.mockClear();
  await user.click(screen.getByText("to hash"));
  await screen.findByText("/a#section");

  // ScrollToTop awaits document.fonts.ready (a stubbed, already-resolved
  // promise in setupTests.ts) before calling scrollIntoView, so the call
  // lands a microtask after the location update above — waitFor gives it
  // that tick instead of asserting before it has had a chance to run.
  await waitFor(() => expect(spy).toHaveBeenCalledTimes(1));
  expect(spy.mock.instances[0]).toBe(document.getElementById("section"));
});

test("navigating to a hash with no matching element neither throws nor scrolls", async () => {
  const scrollToSpy = vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  const scrollIntoViewSpy = vi
    .spyOn(Element.prototype, "scrollIntoView")
    .mockImplementation(() => {});
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/a"]}>
      <Harness />
    </MemoryRouter>,
  );

  scrollToSpy.mockClear();
  scrollIntoViewSpy.mockClear();
  // No throw is the assertion: userEvent.click rejecting or React logging an
  // uncaught error would fail this test on its own.
  await user.click(screen.getByText("to missing hash"));
  await screen.findByText("/a#missing");

  // Give the post-fonts.ready microtask the same tick as the test above, so a
  // regression that scrolls unconditionally cannot slip through by outrunning
  // an assertion made too early.
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(scrollIntoViewSpy).not.toHaveBeenCalled();
  expect(scrollToSpy).not.toHaveBeenCalled();
});
