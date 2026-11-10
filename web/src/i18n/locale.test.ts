import { describe, expect, test } from "vitest";

import {
  htmlLang,
  intlTag,
  localeFromPath,
  localizePath,
  pathInLocale,
  splitLocale,
} from "./locale";

describe("splitLocale", () => {
  test("takes the German segment off, and says the path was German", () => {
    expect(splitLocale("/de/agenda")).toEqual({ locale: "de-CH", path: "/agenda" });
    expect(splitLocale("/de/events/12/edit")).toEqual({ locale: "de-CH", path: "/events/12/edit" });
  });

  test("the German root is the home page", () => {
    expect(splitLocale("/de")).toEqual({ locale: "de-CH", path: "/" });
    expect(splitLocale("/de/")).toEqual({ locale: "de-CH", path: "/" });
  });

  test("leaves a French path as it is, /design included", () => {
    expect(splitLocale("/agenda")).toEqual({ locale: "fr", path: "/agenda" });
    expect(splitLocale("/")).toEqual({ locale: "fr", path: "/" });
    expect(splitLocale("/design")).toEqual({ locale: "fr", path: "/design" });
  });

  test("takes /fr off too, as the French page it names", () => {
    expect(splitLocale("/fr/agenda")).toEqual({ locale: "fr", path: "/agenda" });
    expect(splitLocale("/fr")).toEqual({ locale: "fr", path: "/" });
    expect(splitLocale("/fr/")).toEqual({ locale: "fr", path: "/" });
    expect(splitLocale("/frites")).toEqual({ locale: "fr", path: "/frites" });
  });
});

describe("localizePath", () => {
  test("puts a route's path under /de for German", () => {
    expect(localizePath("/agenda", "de-CH")).toBe("/de/agenda");
    expect(localizePath("/", "de-CH")).toBe("/de");
  });

  test("leaves it as it is for French", () => {
    expect(localizePath("/agenda", "fr")).toBe("/agenda");
    expect(localizePath("/", "fr")).toBe("/");
  });

  test("undoes splitLocale", () => {
    for (const url of ["/de/agenda", "/de", "/agenda", "/"]) {
      const { locale, path } = splitLocale(url);
      expect(localizePath(path, locale)).toBe(url);
    }
  });
});

describe("localeFromPath", () => {
  test("an unprefixed path is French", () => {
    expect(localeFromPath("/agenda")).toBe("fr");
    expect(localeFromPath("/")).toBe("fr");
    expect(localeFromPath("")).toBe("fr");
  });

  test("a /de-prefixed path is German", () => {
    expect(localeFromPath("/de/agenda")).toBe("de-CH");
    expect(localeFromPath("/de/events/12/attendance")).toBe("de-CH");
  });

  test("the bare /de root is German", () => {
    expect(localeFromPath("/de")).toBe("de-CH");
    expect(localeFromPath("/de/")).toBe("de-CH");
  });

  // A prefix match on "/de" would claim every one of these as German.
  test("matches /de as a whole segment, never as a string prefix", () => {
    expect(localeFromPath("/design")).toBe("fr");
    expect(localeFromPath("/depot")).toBe("fr");
    expect(localeFromPath("/demo/x")).toBe("fr");
    expect(localeFromPath("/details")).toBe("fr");
  });

  test("is case-sensitive: /DE is not the German prefix", () => {
    expect(localeFromPath("/DE/agenda")).toBe("fr");
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

  test("the base root and anything under it are French", () => {
    expect(localeFromPath(`${base}/`, base)).toBe("fr");
    expect(localeFromPath(base, base)).toBe("fr");
    expect(localeFromPath(`${base}/agenda`, base)).toBe("fr");
  });

  test("/de under the base is German", () => {
    expect(localeFromPath(`${base}/de`, base)).toBe("de-CH");
    expect(localeFromPath(`${base}/de/agenda`, base)).toBe("de-CH");
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
