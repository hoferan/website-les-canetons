import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { RegisterIndex } from "./RegisterIndex";

test("a register link is a framed button, the button radius and never a pill", () => {
  render(<RegisterIndex entries={[{ id: "drums", label: "Batteurs" }]} />);
  const link = screen.getByRole("link", { name: "Batteurs" });
  expect(link).toHaveAttribute("href", "#drums");
  expect(link).toHaveClass("rounded-button", "cursor-pointer", "active:shadow-raised-pressed");
  expect(link).not.toHaveClass("rounded-full");
});
