import { afterEach, expect, test } from "vitest";

import { LOCALE_STORAGE_KEY, rememberLocale, storedLocale } from "./preference";

afterEach(() => {
  window.localStorage.clear();
});

test("nothing stored reads as no preference", () => {
  expect(storedLocale()).toBeNull();
});

test("a remembered locale reads back", () => {
  rememberLocale("de-CH");
  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("de-CH");
  expect(storedLocale()).toBe("de-CH");
});

// A value written by an older build, by a different app on the same origin, or
// by hand. It must not become a basename.
test("an unrecognised stored value reads as no preference", () => {
  window.localStorage.setItem(LOCALE_STORAGE_KEY, "klingon");
  expect(storedLocale()).toBeNull();
});

test("storage being unavailable is not an error", () => {
  const getItem = Storage.prototype.getItem;
  Storage.prototype.getItem = () => {
    throw new Error("SecurityError: access denied");
  };

  // try/finally, not a bare restore after the assertion: if this expectation
  // ever fails, a trailing restore line never runs and every later test in the
  // file inherits a throwing localStorage -- a failure that looks like
  // something else entirely.
  try {
    expect(storedLocale()).toBeNull();
  } finally {
    Storage.prototype.getItem = getItem;
  }
});
