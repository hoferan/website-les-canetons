import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Commencement } from "./Commencement";

// The flyer used to be a JPEG with an <a download>. It is the PAGE now, printed
// (see the component for why there is no separate flyer panel), so the call to
// action is a print button.
test("the page can be printed as the flyer", () => {
  render(<Commencement />);
  expect(screen.getByRole("button", { name: /Imprimer le flyer/ })).toBeInTheDocument();
});

// If the print container class is ever renamed, the print rules in styles.css
// silently stop matching and the sheet comes out as the whole website. Nothing
// visible on screen would change, so only this catches it.
test("the printable container is marked for the print stylesheet", () => {
  const { container } = render(<Commencement />);
  expect(container.querySelector(".printable")).not.toBeNull();
});

// The facts a parent needs must be on the page, because the page is the flyer.
test("the joining facts are all present", () => {
  render(<Commencement />);
  for (const fact of [
    "Trompette",
    "Sousaphone",
    "Euphonium",
    "Les samedis matin",
    "De 10h à 12h",
    "Werkhof",
  ]) {
    expect(screen.getByText(new RegExp(fact))).toBeInTheDocument();
  }
});

// A wrong phone number dials a stranger, so the audit replaced both joining
// contacts with placeholders. A tel: link on a placeholder would defeat that.
test("the joining contacts are placeholders with no clickable number", () => {
  const { container } = render(<Commencement />);
  expect(container.querySelectorAll("[data-tbd]")).toHaveLength(2);
  expect(container.querySelector('a[href^="tel:"]')).toBeNull();
});

// It used to be a maps/dir/ link with a hardcoded origin coordinate, which
// routed every visitor from a spot west of Fribourg.
test("the Werkhof link is a place lookup, not directions from a fixed origin", () => {
  render(<Commencement />);
  const href = screen.getByRole("link", { name: "Werkhof" }).getAttribute("href")!;
  expect(href).toContain("/maps/search/");
  expect(href).not.toContain("/maps/dir/");
  expect(href).toContain(encodeURIComponent("Planche-Inférieure 14"));
});
