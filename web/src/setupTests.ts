import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { resetMockState } from "./mocks/handlers";
import { server } from "./mocks/node";

// Guarded on `typeof window`: this file is the global setupFiles entry for
// EVERY test, including altcha.test.ts, which opts into `@vitest-environment
// node` for a real WebCrypto SubtleCrypto and so has no window/document at
// all. Referencing them unguarded turned "window is not defined" into a
// failure of that whole file.
if (typeof window !== "undefined") {
  // jsdom does not implement window.scrollTo — calling it logs
  // "Error: Not implemented: window.scrollTo" to stderr instead of doing
  // nothing. ScrollToTop (mounted in Layout, so in every test that renders it)
  // calls it on every navigation, so without this stub every such test prints
  // a line that looks like a failure and is not. A plain no-op, not a mock: no
  // test needs its call history for free, and one that does can vi.spyOn it
  // itself (see ScrollToTop.test.tsx — spying on a stub function works, and
  // afterEach's vi.restoreAllMocks() below restores it back to this stub).
  window.scrollTo = () => {};

  // jsdom does not implement Element.prototype.scrollIntoView AT ALL — unlike
  // scrollTo above, there is no stub to silence; the property is simply
  // undefined, so calling it throws "is not a function". ScrollToTop calls it
  // to honour a hash on a fresh load, and ScrollToTop.test.tsx needs to spy on
  // it, which requires a real function to wrap in the first place.
  Element.prototype.scrollIntoView = () => {};

  // jsdom does not implement document.fonts (the CSS Font Loading API) either
  // — `document.fonts` is plain `undefined`. ScrollToTop awaits
  // `document.fonts.ready` before honouring a hash (see its doc comment: a
  // real font swap reflows the page shortly after first paint, and
  // scrollIntoView must run after that settles, not before). Without this
  // stub every test that navigates to a hashed location throws "Cannot read
  // properties of undefined (reading 'ready')" instead of exercising the
  // component. An already-resolved promise is the right fake here: tests do
  // not need to simulate a slow font load, only to let the component's
  // `.then()` continue.
  Object.defineProperty(document, "fonts", {
    value: { ready: Promise.resolve() },
    configurable: true,
  });
}

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

  // Spies on globals otherwise survive the test that installed them, and so do
  // their call counts. A later test asserting toHaveBeenCalledTimes(1) then
  // counts an earlier test's calls and fails only when the whole file runs,
  // passing in isolation. That reads as flakiness and is not.
  //
  // This used to name window.confirm and window.alert, which the event controls
  // used. They are gone -- a real dialog and a toast replaced them -- but the
  // reset still earns its place: http.test.ts mocks global fetch.
  vi.restoreAllMocks();
});

afterAll(() => server.close());
