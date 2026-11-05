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

/**
 * At a device pixel ratio of 1.25 the strip's last row lands on a fraction of
 * a device pixel, and the browser samples the pattern a little past the rect.
 * With a tile as tall as the rect that sample is the next tile's first row:
 * the from edge's solid top strip, a yellow hairline over the ink footer.
 */
test("every edge's pattern tile is taller than the strip it fills", () => {
  for (const props of [{ from: "var(--color-yellow)" }, { into: "var(--color-ground)" }]) {
    const { container, unmount } = render(<Scallop {...props} />);
    const drawn = Number(container.querySelector("rect")?.getAttribute("height"));
    const tile = Number(container.querySelector("pattern")?.getAttribute("height"));

    expect(tile, JSON.stringify(props)).toBeGreaterThan(drawn);
    unmount();
  }
});

test("an into edge reaches one pixel down into the surface below, keeping its bumps in place", () => {
  const { container } = render(<Scallop into="var(--color-ground)" />);
  const svg = container.querySelector("svg");

  // A pixel lower and a pixel taller, so its top, and the bumps drawn from
  // it, stay 22px above the surface's bottom.
  expect(svg).toHaveClass("-bottom-px");
  expect(svg).toHaveAttribute("height", "23");
});

test("an into edge continues its colour one row under the strip, then stops", () => {
  // The row just past the strip is the next surface, so a sample there must
  // be its colour; the tile's last row stays empty for a sample above the top.
  const { container } = render(<Scallop into="var(--color-ground)" />);
  const drawn = Number(container.querySelector("rect")?.getAttribute("height"));
  const tile = Number(container.querySelector("pattern")?.getAttribute("height"));

  expect(container.querySelector("path")?.getAttribute("d")).toBe(
    `M0 ${drawn + 1}V0q20 22 40 0V${drawn + 1}z`,
  );
  expect(tile).toBe(drawn + 2);
});
