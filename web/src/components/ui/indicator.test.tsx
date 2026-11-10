import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Indicator } from "./indicator";

const mark = () => document.querySelector("[data-indicator] > [aria-hidden]");

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

test("colour, size, ring, position and placement are options", () => {
  render(
    <Indicator color="danger" size="lg" ring="white" position="bottom-left" placement="inside">
      <span>Hôte</span>
    </Indicator>,
  );

  expect(mark()).toHaveClass("bg-danger", "size-4", "ring-white", "bottom-1", "left-1");
  expect(mark()).not.toHaveClass("translate-x-1/2", "-translate-x-1/2");
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
