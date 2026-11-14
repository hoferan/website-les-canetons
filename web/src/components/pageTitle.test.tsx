import { render } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { usePageTitle } from "./pageTitle";

function Page({ name }: { name?: string }) {
  usePageTitle(name);
  return null;
}

afterEach(async () => {
  await setLocale("fr");
});

test("a page's title is its name, then the band's", () => {
  render(<Page name="Contact" />);

  expect(document.title).toBe("Contact – Les Canetons de Fribourg");
});

test("the home page's title is the band's full name alone", () => {
  render(<Page />);

  expect(document.title).toBe("Guggenmusik Les Canetons de Fribourg");
});

test("a new name replaces the title", () => {
  const { rerender } = render(<Page name="Où nous voir" />);

  rerender(<Page name="Wo Sie uns sehen" />);

  expect(document.title).toBe("Wo Sie uns sehen – Les Canetons de Fribourg");
});

test("the German catalogue writes the same pattern", async () => {
  await setLocale("de-CH");

  render(<Page name="Kontakt" />);

  expect(document.title).toBe("Kontakt – Les Canetons de Fribourg");
});
