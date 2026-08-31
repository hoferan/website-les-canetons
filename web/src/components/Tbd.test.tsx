import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Tbd } from "./Tbd";

test("it renders text no reader could mistake for a real name", () => {
  render(<Tbd />);
  expect(screen.getByText(/à compléter/)).toBeInTheDocument();
});

test("the optional label says WHICH fact is missing", () => {
  render(<Tbd what="prénoms des batteurs" />);
  expect(screen.getByText(/à compléter : prénoms des batteurs/)).toBeInTheDocument();
});

// The count of these is the band's to-do list, and it is what stands between a
// placeholder and a public PROD page. If the marker text ever changes, the grep
// in docs/continue-here.md stops finding them silently — hence a data attribute
// to key off rather than the prose.
test("it carries a data attribute so placeholders can be found structurally", () => {
  const { container } = render(<Tbd what="téléphone" />);
  const marked = container.querySelectorAll("[data-tbd]");
  expect(marked).toHaveLength(1);
  expect(marked[0]).toHaveAttribute("data-tbd", "téléphone");
});
