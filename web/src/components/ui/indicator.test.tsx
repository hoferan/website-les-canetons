import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Indicator } from "./indicator";

const mark = () => document.querySelector("[data-indicator-mark]");

test("adds a dot to its host, over the top right corner, cyan with an ink ring", () => {
  render(
    <Indicator>
      <button type="button">Modifier</button>
    </Indicator>,
  );

  expect(screen.getByRole("button", { name: "Modifier" }).parentElement).toHaveAttribute(
    "data-indicator",
  );
  // Decoration only: the host's own name says what it means.
  expect(mark()).toHaveAttribute("aria-hidden", "true");
  expect(mark()).toBeEmptyDOMElement();
  expect(mark()).toHaveClass(
    "bg-cyan",
    "ring-ink",
    "size-3",
    "top-0",
    "right-0",
    "translate-x-1/2",
    "-translate-y-1/2",
  );
});

test("colour, size, ring and corner are options, and the mark always overlaps its corner", () => {
  render(
    <Indicator color="danger" size="lg" ring="white" position="bottom-left">
      <span>Hôte</span>
    </Indicator>,
  );

  expect(mark()).toHaveClass(
    "bg-danger",
    "size-4",
    "ring-white",
    "bottom-0",
    "left-0",
    "-translate-x-1/2",
    "translate-y-1/2",
  );
  expect(mark()).not.toHaveAttribute("style");
});

test("an offset moves the mark in screen directions, from whichever corner", () => {
  const { rerender } = render(
    <Indicator offset={{ x: 3, y: -2 }}>
      <span>Hôte</span>
    </Indicator>,
  );
  // Anchored top right: right moves it left, top moves it down.
  expect(mark()).toHaveStyle({ marginRight: "-3px", marginTop: "-2px" });

  rerender(
    <Indicator position="bottom-left" offset={{ x: 3, y: -2 }}>
      <span>Hôte</span>
    </Indicator>,
  );
  expect(mark()).toHaveStyle({ marginLeft: "3px", marginBottom: "2px" });
});

test("a count shows the number, capped at max, and zero shows nothing", () => {
  const { rerender } = render(
    <Indicator count={3}>
      <span>Hôte</span>
    </Indicator>,
  );
  expect(mark()).toHaveTextContent("3");

  rerender(
    <Indicator count={120}>
      <span>Hôte</span>
    </Indicator>,
  );
  expect(mark()).toHaveTextContent("99+");

  rerender(
    <Indicator count={120} max={9}>
      <span>Hôte</span>
    </Indicator>,
  );
  expect(mark()).toHaveTextContent("9+");

  rerender(
    <Indicator count={0}>
      <span>Hôte</span>
    </Indicator>,
  );
  expect(mark()).toBeNull();
});

test("hidden, it keeps the wrapper and its placing, so the host does not move", () => {
  render(
    <Indicator show={false} className="absolute top-2 right-2">
      <span>Hôte</span>
    </Indicator>,
  );

  const wrapper = screen.getByText("Hôte").parentElement;
  expect(wrapper).toHaveAttribute("data-indicator");
  expect(wrapper).toHaveClass("absolute", "top-2", "right-2");
  expect(mark()).toBeNull();
});
