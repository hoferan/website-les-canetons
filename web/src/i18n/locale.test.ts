import { describe, expect, test } from "vitest";

import { htmlLang, intlTag, localeFromPath, pathInLocale } from "./locale";

describe("localeFromPath", () => {
  test("an unprefixed path is French, mounted at the root", () => {
    expect(localeFromPath("/agenda")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("/")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("")).toEqual({ locale: "fr", basename: "/" });
  });

  test("a /de-prefixed path is German, mounted at /de", () => {
    expect(localeFromPath("/de/agenda")).toEqual({ locale: "de-CH", basename: "/de" });
    expect(localeFromPath("/de/events/12/attendance")).toEqual({
      locale: "de-CH",
      basename: "/de",
    });
  });

  test("the bare /de root is German", () => {
    expect(localeFromPath("/de")).toEqual({ locale: "de-CH", basename: "/de" });
    expect(localeFromPath("/de/")).toEqual({ locale: "de-CH", basename: "/de" });
  });

  // A prefix match on "/de" would claim every one of these, mount the router
  // at /de, and render nothing.
  test("matches /de as a whole segment, never as a string prefix", () => {
    expect(localeFromPath("/design")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("/depot")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("/demo/x")).toEqual({ locale: "fr", basename: "/" });
    expect(localeFromPath("/details")).toEqual({ locale: "fr", basename: "/" });
  });

  test("is case-sensitive: /DE is not the German prefix", () => {
    expect(localeFromPath("/DE/agenda")).toEqual({ locale: "fr", basename: "/" });
  });
});

describe("pathInLocale", () => {
  test("adds the prefix when switching to German", () => {
    expect(pathInLocale("/agenda", "de-CH")).toBe("/de/agenda");
    expect(pathInLocale("/", "de-CH")).toBe("/de");
  });

  test("strips the prefix when switching to French", () => {
    expect(pathInLocale("/de/agenda", "fr")).toBe("/agenda");
    expect(pathInLocale("/de", "fr")).toBe("/");
  });

  test("is idempotent — translating to the locale a path is already in changes nothing", () => {
    expect(pathInLocale("/de/agenda", "de-CH")).toBe("/de/agenda");
    expect(pathInLocale("/agenda", "fr")).toBe("/agenda");
  });
});

// A PR preview serves the SPA from a subpath of a shared origin (#353). The
// prefix comes off before the locale is read and goes back on every path the
// app hands the router or the browser.
describe("under a base path", () => {
  const base = "/website-les-canetons/pr-12";

  test("the base root and anything under it are French, mounted at the base", () => {
    expect(localeFromPath(`${base}/`, base)).toEqual({ locale: "fr", basename: base });
    expect(localeFromPath(base, base)).toEqual({ locale: "fr", basename: base });
    expect(localeFromPath(`${base}/agenda`, base)).toEqual({ locale: "fr", basename: base });
  });

  test("/de under the base is German, mounted at the base's /de", () => {
    expect(localeFromPath(`${base}/de`, base)).toEqual({
      locale: "de-CH",
      basename: `${base}/de`,
    });
    expect(localeFromPath(`${base}/de/agenda`, base)).toEqual({
      locale: "de-CH",
      basename: `${base}/de`,
    });
  });

  test("switching locale keeps the base", () => {
    expect(pathInLocale(`${base}/agenda`, "de-CH", base)).toBe(`${base}/de/agenda`);
    expect(pathInLocale(`${base}/`, "de-CH", base)).toBe(`${base}/de`);
    expect(pathInLocale(`${base}/de/agenda`, "fr", base)).toBe(`${base}/agenda`);
    expect(pathInLocale(`${base}/de`, "fr", base)).toBe(`${base}/`);
  });
});

describe("htmlLang and intlTag", () => {
  test("html lang is the full tag, including for French", () => {
    expect(htmlLang("fr")).toBe("fr-CH");
    expect(htmlLang("de-CH")).toBe("de-CH");
  });

  // One tag per locale. intlTag's docblock says what to do if a long date
  // with a weekday comes back.
  test("French is fr-CH and German is de-CH, with nothing left to choose", () => {
    expect(intlTag("fr")).toBe("fr-CH");
    expect(intlTag("de-CH")).toBe("de-CH");
  });
});
