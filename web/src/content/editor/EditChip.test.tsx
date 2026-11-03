import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { EditChip } from "./EditChip";

test("a chip says 'Modifier' and names the block it opens", () => {
  render(<EditChip label="Texte d'accueil" onClick={() => {}} />);

  const chip = screen.getByRole("button", { name: "Modifier : Texte d'accueil" });
  expect(chip).toHaveTextContent("Modifier");
  expect(chip.textContent).not.toContain(":");
});

test("the text prop is both the visible text and the accessible name", () => {
  render(<EditChip label="Infos du site" text="Modifier les infos du site" onClick={() => {}} />);

  const chip = screen.getByRole("button", { name: "Modifier les infos du site" });
  expect(chip).toHaveTextContent("Modifier les infos du site");
});

test("a chip sits over its block's corner and calls onClick", async () => {
  const onClick = vi.fn();
  render(<EditChip label="Bloc" onClick={onClick} />);

  const chip = screen.getByRole("button");
  expect(chip).toHaveClass("absolute");
  await userEvent.click(chip);
  expect(onClick).toHaveBeenCalledTimes(1);
});
