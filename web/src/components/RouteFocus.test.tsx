import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect, useState } from "react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { expect, test } from "vitest";

import { RouteFocus } from "./RouteFocus";

/** A page whose heading arrives after its data, as a loading page's does. */
function LatePage() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setReady(true), 20);
    return () => clearTimeout(timer);
  }, []);
  return ready ? <h1>page c</h1> : <p>loading</p>;
}

function Harness() {
  return (
    <>
      <RouteFocus />
      <nav>
        <Link to="/b">to b</Link>
        <Link to="/c">to c</Link>
        <Link to="/a#section">to hash</Link>
        <Link to="/a?tab=2">to search only</Link>
        <input aria-label="elsewhere" />
      </nav>
      <main id="main" tabIndex={-1}>
        <Routes>
          <Route
            path="/a"
            element={
              <>
                <h1>page a</h1>
                <div id="section">section</div>
              </>
            }
          />
          <Route path="/b" element={<h1>page b</h1>} />
          <Route path="/c" element={<LatePage />} />
        </Routes>
      </main>
    </>
  );
}

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Harness />
    </MemoryRouter>,
  );
}

test("a fresh load moves no focus", () => {
  renderAt("/a");

  expect(document.body).toHaveFocus();
});

test("a navigation focuses the new page's heading, without making it a tab stop", async () => {
  const user = userEvent.setup();
  renderAt("/a");

  await user.click(screen.getByText("to b"));

  const heading = await screen.findByRole("heading", { name: "page b" });
  await waitFor(() => expect(heading).toHaveFocus());
  expect(heading).toHaveAttribute("tabindex", "-1");
});

test("a page still loading gets <main> first, then its heading when it arrives", async () => {
  const user = userEvent.setup();
  renderAt("/a");

  await user.click(screen.getByText("to c"));

  await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  const heading = await screen.findByRole("heading", { name: "page c" });
  await waitFor(() => expect(heading).toHaveFocus());
});

test("a heading that arrives after the user moved on does not take focus back", async () => {
  const user = userEvent.setup();
  renderAt("/a");

  await user.click(screen.getByText("to c"));
  await waitFor(() => expect(screen.getByRole("main")).toHaveFocus());
  screen.getByLabelText("elsewhere").focus();

  await screen.findByRole("heading", { name: "page c" });
  expect(screen.getByLabelText("elsewhere")).toHaveFocus();
});

test("a jump to a fragment leaves focus alone", async () => {
  const user = userEvent.setup();
  renderAt("/b");

  await user.click(screen.getByText("to hash"));

  await screen.findByRole("heading", { name: "page a" });
  expect(screen.getByText("to hash")).toHaveFocus();
});

test("a change to the search string alone leaves focus alone", async () => {
  const user = userEvent.setup();
  renderAt("/a");

  await user.click(screen.getByText("to search only"));

  expect(screen.getByText("to search only")).toHaveFocus();
});
