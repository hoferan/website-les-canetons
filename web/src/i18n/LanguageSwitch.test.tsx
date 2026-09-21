import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test } from "vitest";

import { renderWithSession } from "../test/renderWithSession";
import { setLocale } from "./index";
import { LanguageSwitch, switchDestination } from "./LanguageSwitch";
import { LOCALE_STORAGE_KEY } from "./preference";

afterEach(async () => {
  await setLocale("fr");
  window.localStorage.clear();
});

/** A browser location, as the switcher reads it. */
function at(pathname: string, search = "", hash = "") {
  return { pathname, search, hash };
}

/* ---------------------------------------------------------------------------
 * The destination — the pure half
 * -------------------------------------------------------------------------- */

test("it maps a French path onto the German mount and back", () => {
  expect(switchDestination("de-CH", at("/agenda"))).toBe("/de/agenda");
  expect(switchDestination("fr", at("/de/agenda"))).toBe("/agenda");
});

test("the roots round-trip, which is the case the redirect guard cares about", () => {
  expect(switchDestination("de-CH", at("/"))).toBe("/de");
  expect(switchDestination("fr", at("/de"))).toBe("/");
});

test("search and hash travel with the switch", () => {
  // Switching language on "past events" should keep showing past events.
  expect(switchDestination("de-CH", at("/events", "?past=1"))).toBe("/de/events?past=1");
  expect(switchDestination("fr", at("/de/events", "?past=1", "#bas"))).toBe("/events?past=1#bas");
});

test("A PATH THAT MERELY STARTS WITH THOSE LETTERS IS NOT THE GERMAN MOUNT", () => {
  // `/design` and `/demo/x` are French pages. Matching `/de` without the
  // segment boundary would strip two letters off each of them.
  expect(switchDestination("fr", at("/design"))).toBe("/design");
  expect(switchDestination("de-CH", at("/design"))).toBe("/de/design");
});

/* ---------------------------------------------------------------------------
 * The control
 * -------------------------------------------------------------------------- */

// AN ENDONYM, NOT A TRANSLATION, in both directions: somebody who cannot read
// the current page has to recognise the way out of it. Two tests rather than
// two renders in one, because render() does not unmount the previous tree
// mid-test and both links would then be on the page at once.
test("a French page offers German, named in German", async () => {
  await renderWithSession(<LanguageSwitch />);
  expect(screen.getByRole("link", { name: "Auf Deutsch wechseln" })).toHaveTextContent("Deutsch");
});

test("a German page offers French, named in French", async () => {
  await renderWithSession(<LanguageSwitch />, { locale: "de-CH" });
  expect(screen.getByRole("link", { name: "Passer en français" })).toHaveTextContent("Français");
});

test("the link declares the target's language, not the page's", async () => {
  await renderWithSession(<LanguageSwitch />);

  const link = screen.getByRole("link", { name: "Auf Deutsch wechseln" });
  // hreflang tells a crawler what is on the other end; lang stops a screen
  // reader pronouncing "Deutsch" with a French voice.
  expect(link).toHaveAttribute("hreflang", "de-CH");
  expect(link).toHaveAttribute("lang", "de-CH");
});

test("THE PREFERENCE IS WRITTEN BEFORE THE NAVIGATION, or the switch bounces", async () => {
  // main.tsx sends a bare "/" to "/de" whenever the stored preference is
  // German. Switching to French from /de lands on "/" — so if the write did
  // not happen first, shouldRedirectToGerman() would bounce the visitor
  // straight back to the page they just left.
  //
  // localStorage is synchronous, so a click handler that writes and returns
  // has finished before the browser navigates. What this asserts is that the
  // write happens at all, and with the right value.
  //
  // MUTATION TEST: drop rememberLocale from the handler and this fails with
  // null — and the app gets a switcher that cannot leave German.
  await renderWithSession(<LanguageSwitch />, { locale: "de-CH" });

  await userEvent.click(screen.getByRole("link", { name: "Passer en français" }));

  expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe("fr");
});

test("it closes the mobile menu it was tapped in", async () => {
  let closed = 0;
  await renderWithSession(<LanguageSwitch onDone={() => (closed += 1)} />);

  await userEvent.click(screen.getByRole("link", { name: "Auf Deutsch wechseln" }));

  expect(closed).toBe(1);
});
