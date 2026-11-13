import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { EditChip } from "./EditChip";

test("a chip is the action bar's chip, with one pencil that names the block it opens", () => {
  render(<EditChip label="Texte d'accueil" onClick={() => {}} />);

  const bar = screen.getByRole("toolbar", { name: "Texte d'accueil" });
  expect(bar).toHaveAttribute("data-action-bar", "chip");
  const chip = screen.getByRole("button", { name: "Modifier : Texte d'accueil" });
  expect(bar).toContainElement(chip);
  expect(screen.getAllByRole("button")).toHaveLength(1);
  // The main action: its word shows at rest, from sm up.
  expect(chip).toHaveAttribute("data-main");
  expect(screen.getByText("Modifier")).toHaveClass("max-sm:hidden");
  expect(chip.textContent).not.toContain(":");
  expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

test("the text prop is both the visible word and the accessible name", () => {
  render(<EditChip label="Infos du site" text="Modifier les infos du site" onClick={() => {}} />);

  const chip = screen.getByRole("button", { name: "Modifier les infos du site" });
  expect(chip).toHaveTextContent("Modifier les infos du site");
});

test("a block with a text missing its German wears the corner flag and says so", () => {
  const { rerender } = render(<EditChip label="Texte d'accueil" onClick={() => {}} />);
  const plain = screen.getByRole("button", { name: "Modifier : Texte d'accueil" });
  expect(plain.querySelector("[data-flag]")).toBeNull();

  rerender(<EditChip label="Texte d'accueil" missingGerman onClick={() => {}} />);
  const chip = screen.getByRole("button", {
    name: "Modifier : Texte d'accueil (sans allemand)",
  });
  // The visible word stays short; the name carries the flag's meaning.
  expect(chip.textContent).toBe("Modifier");
  expect(chip.querySelector("[data-flag]")).toHaveAttribute("aria-hidden", "true");
});

test("a chip with its own text adds 'sans allemand' to it", () => {
  render(
    <EditChip
      label="Infos du site"
      text="Modifier les infos du site"
      missingGerman
      onClick={() => {}}
    />,
  );

  const chip = screen.getByRole("button", {
    name: "Modifier les infos du site (sans allemand)",
  });
  expect(chip.querySelector("[data-flag]")).not.toBeNull();
});

test("a chip sits inside its block's top right corner unless placed, and calls onClick", async () => {
  const onClick = vi.fn();
  const { rerender } = render(<EditChip label="Bloc" onClick={onClick} />);

  const bar = screen.getByRole("toolbar");
  expect(bar).toHaveClass("absolute", "top-2", "right-2", "z-10");
  await userEvent.click(screen.getByRole("button"));
  expect(onClick).toHaveBeenCalledTimes(1);

  rerender(<EditChip label="Bloc" className="absolute right-2 bottom-2" onClick={onClick} />);
  expect(screen.getByRole("toolbar")).toHaveClass("bottom-2");
  expect(screen.getByRole("toolbar")).not.toHaveClass("top-2");
});

test("on the black stage the chip's shadow turns pink", () => {
  render(<EditChip label="Bloc" surface="stage" onClick={() => {}} />);

  expect(screen.getByRole("toolbar")).toHaveClass("shadow-raised-stage");
});

test("a busy chip is marked rather than disabled, and ignores its clicks", async () => {
  const onClick = vi.fn();
  render(<EditChip label="Bloc" disabled onClick={onClick} />);

  const chip = screen.getByRole("button");
  expect(chip).toHaveAttribute("aria-disabled", "true");
  expect(chip).toBeEnabled();
  await userEvent.click(chip);
  expect(onClick).not.toHaveBeenCalled();
});
