import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { logoutDestination } from "./logout";

afterEach(async () => {
  await setLocale("fr");
});

/**
 * The destination is the seam, because the navigation is not testable here:
 * window.location is non-configurable in this jsdom setup, so a spy on
 * .assign throws "Cannot redefine property: assign". A real browser proves
 * the navigation.
 */
test("logging out in French lands on the site root", () => {
  expect(logoutDestination()).toBe("/");
});

test("logging out in German lands on the German root, not the French one", async () => {
  await setLocale("de-CH");

  expect(logoutDestination()).toBe("/de");
});
