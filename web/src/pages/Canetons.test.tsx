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

// The slip this guards against is a caption landing under the wrong
// photograph, which no count would catch and which reads as correct.
//
// The rosters are placeholders now (see the component), so the assertion moved
// to the two things still worth pinning: that each register's photograph is its
// own, and that the one register with real names carries them.
test("each register's photograph belongs to that register", () => {
  render(<Canetons />);
  for (const [heading, image] of [
    ["La Direction Musicale", "directionmusicale.jpg"],
    ["Nos Batteurs", "batteurs.jpg"],
    ["Nos Grosses-Caisses", "grossescaisses.jpg"],
    ["Notre Lyre", "lyre.jpg"],
    ["Nos Cloches", "cloches.jpg"],
    ["Nos Trompettes", "trompettes.jpg"],
    ["Nos Trombones", "trombones.jpg"],
  ]) {
    const section = screen.getByRole("heading", { name: heading }).closest("article")!;
    expect(within(section).getByRole("img")).toHaveAttribute("src", `/assets/img/${image}`);
  }
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
