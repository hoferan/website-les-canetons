import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { setMockUser } from "../mocks/handlers";
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
  // Deliberately NOT renderWithSession: the point is the state BEFORE the boot
  // gate opens, which that helper exists to wait past.
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
  // Without the throw this returns null and every consumer crashes on a
  // property access somewhere far away from the actual mistake.
  expect(() => render(<Probe />)).toThrow(/outside SessionProvider/);
});

/**
 * can() is UX only — Laravel's `permission:` middleware is the sole
 * enforcement. These tests pin that it reads the permission STRINGS the API
 * sends and never a role name: which role granted a permission is not a
 * question any part of the UI may ask (design §3), the same rule the
 * middleware follows.
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
