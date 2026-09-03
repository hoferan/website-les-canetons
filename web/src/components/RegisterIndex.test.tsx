import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { RegisterIndex } from "./RegisterIndex";

const ENTRIES = [
  { id: "direction", label: "Direction" },
  { id: "drums", label: "Batteurs" },
  { id: "lyre", label: "Lyre" },
];

test("it renders one link per entry, in the order given", () => {
  render(<RegisterIndex entries={ENTRIES} />);
  const nav = screen.getByRole("navigation", { name: "Registres" });

  expect(
    within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Direction", "Batteurs", "Lyre"]);
});

// A same-page fragment, not a router Link: react-router would treat "#drums" as
// a route and the browser's own anchor handling -- which is what actually
// scrolls -- would never run.
test("each link is a fragment pointing at its section", () => {
  render(<RegisterIndex entries={ENTRIES} />);

  expect(screen.getByRole("link", { name: "Batteurs" })).toHaveAttribute("href", "#drums");
});

// It sits on a page whose job is to introduce the band; a second unlabelled
// <nav> beside the site navigation is what makes it announce as something.
test("the nav is named", () => {
  render(<RegisterIndex entries={ENTRIES} />);

  expect(screen.getByRole("navigation", { name: "Registres" })).toBeInTheDocument();
});
