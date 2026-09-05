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
      <span data-testid="role">{user?.role ?? "anonymous"}</span>
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

test("a 401 from /user is a normal answer meaning anonymous, not an error", async () => {
  await renderWithSession(<Probe />);
  expect(await screen.findByTestId("role")).toHaveTextContent("anonymous");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("a logged-in user's role reaches the context", async () => {
  setMockUser("demo.admin");
  await renderWithSession(<Probe />);
  expect(await screen.findByTestId("role")).toHaveTextContent("admin");
});

test("useSession outside the provider fails loudly rather than returning undefined", () => {
  // Without the throw this returns null and every consumer crashes on a
  // property access somewhere far away from the actual mistake.
  expect(() => render(<Probe />)).toThrow(/outside SessionProvider/);
});
