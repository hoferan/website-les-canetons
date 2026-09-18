import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { logoutDestination } from "./LogoutButton";

afterEach(async () => {
  await setLocale("fr");
});

/**
 * THE DESTINATION IS THE SEAM, because the navigation is not testable here:
 * window.location is non-configurable in this jsdom setup, so a spy on
 * .assign throws "Cannot redefine property: assign" rather than recording
 * anything. Layout.test.tsx:128-135 documents that, having hit it. The
 * navigation itself is proven in a real browser.
 */
test("logging out in French lands on the site root", () => {
  expect(logoutDestination()).toBe("/");
});

test("logging out in German lands on the German root, not the French one", async () => {
  await setLocale("de-CH");

  expect(logoutDestination()).toBe("/de");
});
