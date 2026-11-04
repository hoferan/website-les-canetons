import { render } from "@testing-library/react";
import { expect, test } from "vitest";

import { Scallop } from "./Scallop";

test("a from edge reaches one pixel up into the surface above, closing any hairline", () => {
  const { container } = render(<Scallop from="var(--color-yellow)" />);
  const svg = container.querySelector("svg");

  expect(svg).toHaveClass("-top-px");
  // The bumps' 22px plus the 1px overlap, drawn in the bump colour.
  expect(svg).toHaveAttribute("height", "23");
  expect(container.querySelector("path")?.getAttribute("d")).toMatch(/^M0 0H40V1q/);
});
