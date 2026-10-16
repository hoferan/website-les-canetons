import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Link, Route, Routes, useNavigate } from "react-router-dom";
import { afterEach, expect, test, vi } from "vitest";

import { renderWithSession } from "../test/renderWithSession";
import { useLeaveGuard } from "./LeaveGuard";

function Guard({ active, message = "Quitter ?" }: { active: boolean; message?: string }) {
  useLeaveGuard(active, message);
  return null;
}

function Page({ guards }: { guards: boolean[] }) {
  const navigate = useNavigate();
  return (
    <>
      <h1>Page gardée</h1>
      {guards.map((active, index) => (
        <Guard key={index} active={active} />
      ))}
      <Link to="/elsewhere">Ailleurs</Link>
      <Link to="/guarded#top">Même page</Link>
      <button type="button" onClick={() => navigate(-1)}>
        Retour
      </button>
    </>
  );
}

async function renderGuarded(guards: boolean[]) {
  await renderWithSession(
    <Routes>
      <Route path="/start" element={<Link to="/guarded">Vers la page gardée</Link>} />
      <Route path="/guarded" element={<Page guards={guards} />} />
      <Route path="/elsewhere" element={<h1>Ailleurs</h1>} />
    </Routes>,
    { route: "/start" },
  );
  await userEvent.click(screen.getByRole("link", { name: "Vers la page gardée" }));
  await screen.findByRole("heading", { name: "Page gardée" });
}

afterEach(() => {
  vi.restoreAllMocks();
});

test("a link out of a guarded page asks, and stays when the answer is no", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await renderGuarded([true]);

  await userEvent.click(screen.getByRole("link", { name: "Ailleurs" }));

  expect(confirm).toHaveBeenCalledWith("Quitter ?");
  expect(screen.getByRole("heading", { name: "Page gardée" })).toBeInTheDocument();
});

test("a link out of a guarded page leaves when the answer is yes", async () => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  await renderGuarded([true]);

  await userEvent.click(screen.getByRole("link", { name: "Ailleurs" }));

  expect(await screen.findByRole("heading", { name: "Ailleurs" })).toBeInTheDocument();
});

test("Back is caught too, which the click-only guard before #232 could not do", async () => {
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await renderGuarded([true]);

  await userEvent.click(screen.getByRole("button", { name: "Retour" }));

  expect(confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading", { name: "Page gardée" })).toBeInTheDocument();
});

test("an active guard still counts when an idle one registered after it", async () => {
  // React Router asks only the last blocker registered. One blocker per guard
  // would ask the idle second guard here and let the navigation through.
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  await renderGuarded([true, false]);

  await userEvent.click(screen.getByRole("link", { name: "Ailleurs" }));

  expect(confirm).toHaveBeenCalledOnce();
  expect(screen.getByRole("heading", { name: "Page gardée" })).toBeInTheDocument();
});

test("an idle guard asks nothing", async () => {
  const confirm = vi.spyOn(window, "confirm");
  await renderGuarded([false]);

  await userEvent.click(screen.getByRole("link", { name: "Ailleurs" }));

  expect(await screen.findByRole("heading", { name: "Ailleurs" })).toBeInTheDocument();
  expect(confirm).not.toHaveBeenCalled();
});

test("a link to the same page is not leaving it", async () => {
  const confirm = vi.spyOn(window, "confirm");
  await renderGuarded([true]);

  await userEvent.click(screen.getByRole("link", { name: "Même page" }));

  expect(confirm).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "Page gardée" })).toBeInTheDocument();
});

test("an active guard warns on closing the tab", async () => {
  await renderGuarded([true]);

  const event = new Event("beforeunload", { cancelable: true });
  window.dispatchEvent(event);

  expect(event.defaultPrevented).toBe(true);
});
