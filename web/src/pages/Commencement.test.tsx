import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Commencement } from "./Commencement";

// The flyer is gone entirely: Flyer.jpeg and its download went on 2026-08-31,
// and the print button that briefly replaced them was removed at the band's
// request. /commencement is a plain information page now — so the facts a parent
// needs have to be ON it, with nothing to print or download.
test("nothing offers a download or a print", () => {
  const { container } = render(<Commencement />);
  expect(container.querySelector("[download]")).toBeNull();
  expect(screen.queryByRole("button", { name: /Imprimer/ })).not.toBeInTheDocument();
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
