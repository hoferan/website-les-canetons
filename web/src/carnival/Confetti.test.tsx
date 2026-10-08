import { render } from "@testing-library/react";
import { afterEach, expect, test, vi } from "vitest";

import { Confetti } from "./Confetti";

afterEach(() => {
  vi.restoreAllMocks();
});

/**
 * jsdom has no layout, so the boxes are stubbed: a 1280x600 hero with a
 * headline filling its left half. What is under test is the wiring, that the
 * component measures its PARENT and keeps off the marked children;
 * scatter.test.ts already covers the geometry.
 */
test("scatters over its parent and keeps off the marked text", () => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    if (this.tagName === "H1") {
      return DOMRect.fromRect({ x: 0, y: 0, width: 640, height: 600 });
    }
    if (this.getAttribute("data-testid") === "hero") {
      return DOMRect.fromRect({ x: 0, y: 0, width: 1280, height: 600 });
    }
    return DOMRect.fromRect();
  });

  const { container } = render(
    <div data-testid="hero">
      <Confetti seed={7} colours={["#ffd23f", "#2ee6d6"]} />
      <h1 data-confetti-avoid>La guggen</h1>
    </div>,
  );

  const pieces = [...container.querySelectorAll("svg > g")];
  expect(pieces.length).toBeGreaterThan(10);
  for (const piece of pieces) {
    const x = Number(/translate\(([\d.]+)/.exec(piece.getAttribute("transform") ?? "")?.[1]);
    expect(x).toBeGreaterThan(640);
  }
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});
