import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { resetMockState } from "./mocks/handlers";
import { server } from "./mocks/node";

// onUnhandledRequest: "error", not "bypass". In a test an unhandled request is
// a missing handler, and letting it reach the network produces a confusing
// timeout much later instead of a clear failure here.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  // Testing Library only registers its own auto-cleanup when the test
  // framework's globals are exposed. This project imports test/expect
  // explicitly (no `globals: true`), so without this every render stays in
  // document.body and the next test fails with "Found multiple elements" —
  // which reads like a component bug and is not one.
  cleanup();

  // Both are needed: resetHandlers() drops per-test server.use() overrides,
  // resetMockState() clears the session and events the handlers keep in module
  // state. Forget the second and a test that logs in leaks into the next one.
  server.resetHandlers();
  resetMockState();

  // Spies on globals — window.confirm and window.alert, which the event
  // controls use — otherwise survive the test that installed them, and so do
  // their call counts. A later test asserting toHaveBeenCalledTimes(1) then
  // counts an earlier test's calls and fails only when the whole file runs,
  // passing in isolation. That reads as flakiness and is not.
  vi.restoreAllMocks();
});

afterAll(() => server.close());
