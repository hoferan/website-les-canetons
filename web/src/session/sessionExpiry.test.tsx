import { useMutation } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { Route, Routes, useLocation } from "react-router-dom";
import { afterEach, expect, test } from "vitest";

import { useAuthLogout } from "../api/generated/endpoints";
import { customFetch } from "../api/http";
import { RequirePermission } from "../components/guards";
import { problem, setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";

/**
 * A session that dies while a members' page is open.
 *
 * `/me` is cached forever, so nothing re-reads it on its own. These pin that
 * the first 401 from any other call makes SessionProvider ask again, which is
 * what lets RequirePermission send the member to the login form.
 */

let meRequests = 0;
function countMe({ request }: { request: Request }) {
  if (new URL(request.url).pathname === "/api/v1/me") meRequests += 1;
}
server.events.on("request:start", countMe);
afterEach(() => {
  meRequests = 0;
});

// Any write the API refuses for want of a session. Not a real endpoint, so the
// test does not depend on what one screen happens to send.
const unauthenticatedWrite = http.post("/api/v1/probe", () =>
  problem(401, "not_authenticated", "Not authenticated"),
);

function WritesSomething() {
  const write = useMutation({ mutationFn: () => customFetch("/probe", { method: "POST" }) });
  return (
    <button type="button" onClick={() => write.mutate()}>
      write
    </button>
  );
}

function LoginProbe() {
  const from = (useLocation().state as { from?: string } | null)?.from;
  return <p>login form, from {from}</p>;
}

function Guarded({ children }: { children: React.ReactNode }) {
  return (
    <Routes>
      <Route path="/login" element={<LoginProbe />} />
      <Route element={<RequirePermission permission="events.view" />}>
        <Route path="/events" element={children} />
      </Route>
    </Routes>
  );
}

test("a 401 on a write sends a logged-in member to the login form, remembering the page", async () => {
  server.use(unauthenticatedWrite);
  setMockUser("demo.player");
  await renderWithSession(
    <Guarded>
      <WritesSomething />
    </Guarded>,
    { route: "/events?week=2#top" },
  );

  // The session expires on the server while the page is open.
  setMockUser(null);
  await userEvent.click(await screen.findByRole("button", { name: "write" }));

  expect(await screen.findByText("login form, from /events?week=2#top")).toBeInTheDocument();
});

test("the 401 that /me answers on the way does not ask /me again", async () => {
  server.use(unauthenticatedWrite);
  setMockUser("demo.player");
  await renderWithSession(
    <Guarded>
      <WritesSomething />
    </Guarded>,
    { route: "/events" },
  );

  setMockUser(null);
  await userEvent.click(await screen.findByRole("button", { name: "write" }));
  await screen.findByText(/login form/);

  // Once at boot, once after the write's 401. A third would be /me reacting
  // to its own answer, which is a loop.
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(meRequests).toBe(2);
});

test("a 401 for a visitor who was never logged in does not ask /me again", async () => {
  server.use(unauthenticatedWrite);
  await renderWithSession(<WritesSomething />);

  await userEvent.click(screen.getByRole("button", { name: "write" }));

  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(meRequests).toBe(1);
});

/**
 * Logout expects its 401 (logout.ts) and answers it with a full page load.
 * Re-reading /me under it would redirect to the login form while the browser
 * is already on its way to the front page.
 */
function LogsOut() {
  const logout = useAuthLogout();
  return (
    <button type="button" onClick={() => logout.mutate()}>
      log out
    </button>
  );
}

test("the 401 logout expects leaves /me alone", async () => {
  server.use(
    http.post("/api/v1/logout", () => problem(401, "not_authenticated", "Not authenticated")),
  );
  setMockUser("demo.player");
  await renderWithSession(<LogsOut />);

  await userEvent.click(screen.getByRole("button", { name: "log out" }));

  await waitFor(() => expect(meRequests).toBe(1));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(meRequests).toBe(1);
});
