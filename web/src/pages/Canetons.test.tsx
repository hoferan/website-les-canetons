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
  ]);
});

// The slip this guards against is a caption landing under the wrong
// photograph, which no count would catch and which reads as correct.
test("each register's photograph and roster belong to that register", () => {
  render(<Canetons />);
  const trumpets = screen.getByRole("heading", { name: "Nos Trompettes" }).closest("article")!;
  expect(within(trumpets).getByRole("img")).toHaveAttribute("src", "/assets/img/trompettes.jpg");
  expect(trumpets).toHaveTextContent("Naïma, Cléa E, Maeva, Eloïse, Coline, Gaëtan");
});
