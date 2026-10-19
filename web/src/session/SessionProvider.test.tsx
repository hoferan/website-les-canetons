import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { expect, test } from "vitest";

import { setLocale } from "../i18n";
import { setMockUser } from "../mocks/handlers";
import { server } from "../mocks/node";
import { renderWithSession } from "../test/renderWithSession";
import { SessionProvider, useSession } from "./SessionProvider";

function Probe() {
  const { config, user } = useSession();
  return (
    <div>
      <span data-testid="env">{config.env}</span>
      <span data-testid="username">{user?.username ?? "anonymous"}</span>
    </div>
  );
}

test("nothing renders until config has resolved", () => {
  // Not renderWithSession, which waits past the boot gate this test is about.
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );

  expect(screen.queryByTestId("env")).toBeNull();
});

test("config reaches the context once the gate opens", async () => {
  await renderWithSession(<Probe />);
  expect(await screen.findByTestId("env")).toHaveTextContent("dev");
});

test("a 401 from /me is a normal answer meaning anonymous, not an error", async () => {
  await renderWithSession(<Probe />);
  expect(await screen.findByTestId("username")).toHaveTextContent("anonymous");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a logged-in user's identity reaches the context", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<Probe />);
  expect(await screen.findByTestId("username")).toHaveTextContent("demo.direction");
});

test("useSession outside the provider fails loudly rather than returning undefined", () => {
  // Without the throw, every consumer crashes on a property access far from
  // the actual mistake.
  expect(() => render(<Probe />)).toThrow(/outside SessionProvider/);
});

/**
 * can() reads the permission strings the API sends, never a role name
 * (ADR 0014).
 */
function CanProbe() {
  const { can } = useSession();
  return (
    <div>
      <span data-testid="manage">{String(can("members.manage"))}</span>
      <span data-testid="registrations">{String(can("registrations.view"))}</span>
    </div>
  );
}

test("an anonymous visitor can do nothing", async () => {
  await renderWithSession(<CanProbe />);
  expect(await screen.findByTestId("manage")).toHaveTextContent("false");
});

test("a permission the member holds is granted", async () => {
  setMockUser("demo.direction");
  await renderWithSession(<CanProbe />);
  expect(await screen.findByTestId("manage")).toHaveTextContent("true");
});

test("a permission the member does not hold is refused", async () => {
  setMockUser("demo.player");
  await renderWithSession(<CanProbe />);
  expect(await screen.findByTestId("manage")).toHaveTextContent("false");
  expect(screen.getByTestId("registrations")).toHaveTextContent("false");
});

/**
 * The boot gate's refusal, in both locales.
 *
 * Not renderWithSession: its `booted` marker is a child of the provider, which
 * renders the refusal instead, so the helper would hang rather than fail.
 * `setLocale` is called by hand; setupTests.ts resets it to French after every
 * test.
 */
async function renderBootFailure() {
  server.use(http.get("/api/v1/config", () => new HttpResponse(null, { status: 503 })));

  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <Probe />
      </SessionProvider>
    </QueryClientProvider>,
  );
}

test("a config that will not load says so in French", async () => {
  await renderBootFailure();

  expect(await screen.findByRole("alert")).toHaveTextContent("Le site n’a pas pu démarrer.");
  expect(screen.queryByTestId("env")).toBeNull();
});

test("a config that will not load says so in German", async () => {
  await setLocale("de-CH");
  await renderBootFailure();

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Die Website konnte nicht gestartet werden.",
  );
});
