import "@testing-library/jest-dom/vitest";

import { afterAll, afterEach, beforeAll } from "vitest";

import { resetMockState } from "./mocks/handlers";
import { server } from "./mocks/node";

// onUnhandledRequest: "error", not "bypass". In a test an unhandled request is
// a missing handler, and letting it reach the network produces a confusing
// timeout much later instead of a clear failure here.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(() => {
  // Both are needed: resetHandlers() drops per-test server.use() overrides,
  // resetMockState() clears the session and events the handlers keep in module
  // state. Forget the second and a test that logs in leaks into the next one.
  server.resetHandlers();
  resetMockState();
});

afterAll(() => server.close());
