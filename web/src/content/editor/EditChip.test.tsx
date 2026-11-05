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

  // Closed to nothing, and opened from sm by hover or keyboard focus only.
  const wrapper = screen.getByText("Modifier").parentElement;
  expect(wrapper).toHaveClass(
    "max-w-0",
    "sm:group-hover/icon:max-w-56",
    "sm:group-focus-visible/icon:max-w-56",
  );
  expect(chip.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

test("a chip grows in place rather than showing a tip", () => {
  render(<EditChip label="Texte d'accueil" onClick={() => {}} />);

  expect(screen.getByRole("button")).toHaveAttribute("data-mode", "grow");
});

test("a reveal chip link is an icon-only link chip that grows", () => {
  render(
    <MemoryRouter>
      <ChipLink
        to="/history/1/edit"
        label="Modifier"
        ariaLabel="Modifier Carnaval 1990"
        icon={Plus}
        corner={false}
        reveal
      />
    </MemoryRouter>,
  );

  const link = screen.getByRole("link", { name: "Modifier Carnaval 1990" });
  expect(link).toHaveAttribute("href", "/history/1/edit");
  expect(link).toHaveAttribute("data-mode", "grow");
  expect(link).toHaveAttribute("data-chip", "link");
  expect(link).not.toHaveClass("absolute");
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
      <ChipLink label="Ajouter une entrée" to="/history/new" />
    </MemoryRouter>,
  );

  const link = screen.getByRole("link", { name: "Ajouter une entrée" });
  expect(link).toHaveAttribute("href", "/history/new");
  expect(link).toHaveTextContent("Ajouter une entrée");
  expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

test("a chip button is icon only, named by its label, and clickable unless disabled", async () => {
  const onClick = vi.fn();
  const { rerender } = render(
    <ChipButton label="Déplacer « Cloches » avant" word="Avant" icon={Plus} onClick={onClick} />,
  );

  const button = screen.getByRole("button", { name: "Déplacer « Cloches » avant" });
  // Only the short word, which grows out on hover or focus.
  expect(button.textContent).toBe("Avant");
  expect(button).toHaveAttribute("data-mode", "grow");
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  await userEvent.click(button);
  expect(onClick).toHaveBeenCalledTimes(1);

  rerender(<ChipButton label="Monter" icon={Plus} onClick={onClick} disabled />);
  const waiting = screen.getByRole("button", { name: "Monter" });
  // Marked rather than disabled, so it keeps the keyboard's focus.
  expect(waiting).toHaveAttribute("aria-disabled", "true");
  expect(waiting).toBeEnabled();
  waiting.focus();
  await userEvent.keyboard("{Enter}");
  expect(waiting).toHaveFocus();
  expect(onClick).toHaveBeenCalledTimes(1);
});
