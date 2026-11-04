import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { Plus } from "lucide-react";
import { expect, test, vi } from "vitest";

import { ChipButton, ChipLink, EditChip } from "./EditChip";

test("a chip names the block it opens and shows 'Modifier' only on hover or focus from sm", () => {
  render(<EditChip label="Texte d'accueil" onClick={() => {}} />);

  const chip = screen.getByRole("button", { name: "Modifier : Texte d'accueil" });
  expect(chip).toHaveTextContent("Modifier");
  expect(chip.textContent).not.toContain(":");

  const word = screen.getByText("Modifier");
  expect(word).toHaveClass(
    "hidden",
    "sm:group-hover/chip:inline",
    "sm:group-focus-visible/chip:inline",
  );
  expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

test("the text prop is both the visible text and the accessible name", () => {
  render(<EditChip label="Infos du site" text="Modifier les infos du site" onClick={() => {}} />);

  const chip = screen.getByRole("button", { name: "Modifier les infos du site" });
  expect(chip).toHaveTextContent("Modifier les infos du site");
});

test("a chip sits inside its block's top right corner and calls onClick", async () => {
  const onClick = vi.fn();
  render(<EditChip label="Bloc" onClick={onClick} />);

  const chip = screen.getByRole("button");
  expect(chip).toHaveClass("absolute", "top-2", "right-2");
  expect(chip).not.toHaveClass("-top-3");
  await userEvent.click(chip);
  expect(onClick).toHaveBeenCalledTimes(1);
});

test("a chip link shows its label and goes to its target", () => {
  render(
    <MemoryRouter>
      <ChipLink label="Géré dans Membres" to="/members" />
    </MemoryRouter>,
  );

  const link = screen.getByRole("link", { name: "Géré dans Membres" });
  expect(link).toHaveAttribute("href", "/members");
  expect(link).toHaveTextContent("Géré dans Membres");
  expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

test("a chip button is icon only, named by its label, and clickable unless disabled", async () => {
  const onClick = vi.fn();
  const { rerender } = render(<ChipButton label="Monter" icon={Plus} onClick={onClick} />);

  const button = screen.getByRole("button", { name: "Monter" });
  expect(button.textContent).toBe("");
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  await userEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);

  rerender(<ChipButton label="Monter" icon={Plus} onClick={onClick} disabled />);
  expect(screen.getByRole("button", { name: "Monter" })).toBeDisabled();
});
