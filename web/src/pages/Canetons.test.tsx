import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { Canetons } from "./Canetons";

test("every register has a section, in the old page's order", () => {
  render(<Canetons />);
  expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
    "La Direction Musicale",
    "Nos Batteurs",
    "Nos Grosses-Caisses",
    "Notre Lyre",
    "Nos Cloches",
    "Nos Trompettes",
    "Nos Trombones",
    // Moved here from /comite_teamdirection on 2026-08-31. It is last on
    // purpose: the registers are the page, and this is an addendum.
    "Le parrain et la marraine",
  ]);
});

// The slip this guards against is a label landing under the wrong register,
// which no count would catch and which reads as correct. The photographs are
// gone (the band asked us to assume all of them are out of date), so the
// assertion moved from src attributes to the placeholder each register names.
test("each register's photo placeholder names that register", () => {
  render(<Canetons />);
  for (const [heading, what] of [
    ["La Direction Musicale", "de la direction musicale"],
    ["Nos Batteurs", "des batteurs"],
    ["Nos Grosses-Caisses", "des grosses-caisses"],
    ["Notre Lyre", "de la lyre"],
    ["Nos Cloches", "des cloches"],
    ["Nos Trompettes", "des trompettes"],
    ["Nos Trombones", "des trombones"],
  ]) {
    const section = screen.getByRole("heading", { name: heading }).closest("article")!;
    const pending = within(section).getByText(/Nouvelle photo/);
    expect(pending).toHaveTextContent(`Nouvelle photo ${what} à venir`);
  }
});

// Nothing on this page should still try to load a photograph.
test("no photographs are requested", () => {
  const { container } = render(<Canetons />);
  expect(container.querySelectorAll("img")).toHaveLength(0);
});

// The direction musicale is the one fact on this page the band confirmed, and
// the whole reason the page was edited: it used to name Laura and Delphine,
// which /historique contradicted.
test("the direction musicale names the current pair, not the outgoing one", () => {
  render(<Canetons />);
  const direction = screen
    .getByRole("heading", { name: "La Direction Musicale" })
    .closest("article")!;
  expect(direction).toHaveTextContent("Lilou et Anaïs");
  expect(direction).not.toHaveTextContent(/Laura|Delphine/);
});

// A roster left as a placeholder must be visibly a placeholder. If someone
// fills one in, this count drops — which is the point.
test("the registers without confirmed names show a placeholder", () => {
  const { container } = render(<Canetons />);
  expect(container.querySelectorAll("[data-tbd]")).toHaveLength(6);
});
