import "@testing-library/jest-dom/vitest";

import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";

import { setLocale } from "./i18n";
import { resetMockState } from "./mocks/handlers";
import { server } from "./mocks/node";

// Guarded on `typeof window`: this setup file also runs for tests that opt
// into `@vitest-environment node`, which have no window or document.
if (typeof window !== "undefined") {
  // jsdom logs "Error: Not implemented: window.scrollTo", and ScrollToTop
  // (in Layout) calls it on every navigation. A plain no-op; a test that needs
  // the calls can vi.spyOn it (ScrollToTop.test.tsx), and vi.restoreAllMocks()
  // below puts the stub back.
  window.scrollTo = () => {};

  // jsdom has no pointer capture either, and sonner calls setPointerCapture on
  // pointerdown so a toast can be swiped, which throws as soon as userEvent
  // clicks inside one.
  Element.prototype.setPointerCapture ??= () => {};
  Element.prototype.releasePointerCapture ??= () => {};
  Element.prototype.hasPointerCapture ??= () => false;
}

// In a test an unhandled request is a missing handler; letting it reach the
// network gives a confusing timeout instead of a clear failure.
beforeAll(() => server.listen({ onUnhandledRequest: "error" }));

afterEach(async () => {
  // Testing Library registers its auto-cleanup only with `globals: true`,
  // which this project does not use. Without this, renders pile up in
  // document.body and the next test finds multiple elements.
  cleanup();

  // resetHandlers() drops per-test server.use() overrides; resetMockState()
  // clears the session the handlers keep, or a login leaks into the next test.
  server.resetHandlers();
  resetMockState();

  // A test that rendered in German would otherwise leak the locale into the
  // next one. Awaited, or it can settle after the next test's first render.
  await setLocale("fr");

  // Spies on globals (http.test.ts mocks fetch) otherwise survive their test,
  // call counts included, and a later toHaveBeenCalledTimes fails only when
  // the whole file runs.
  vi.restoreAllMocks();
});

afterAll(() => server.close());
