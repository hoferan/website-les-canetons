import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ArrowUp, Pencil } from "lucide-react";
import { MemoryRouter, Link } from "react-router-dom";
import { expect, test, vi } from "vitest";

import { IconButton } from "./icon-button";

test("has its label as its name", () => {
  render(<IconButton icon={ArrowUp} label="Monter Cloches" word="Monter" />);

  const button = screen.getByRole("button", { name: "Monter Cloches" });
  expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

test("tip shows the word in a portal on hover", async () => {
  render(
    <div data-testid="row">
      <IconButton icon={ArrowUp} label="Monter Cloches" word="Monter" />
    </div>,
  );

  const button = screen.getByRole("button", { name: "Monter Cloches" });
  await userEvent.hover(button);

  const tip = await screen.findByRole("tooltip");
  expect(tip).toHaveTextContent("Monter");
  // A row inside a scrolling dialog or a clipped card would cut it off.
  expect(screen.getByTestId("row")).not.toContainElement(tip);
});

test("tip shows on keyboard focus", async () => {
  render(<IconButton icon={ArrowUp} label="Monter Cloches" word="Monter" />);

  await userEvent.tab();

  expect(screen.getByRole("button", { name: "Monter Cloches" })).toHaveFocus();
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Monter");
});

test("focus handed back after a click shows no tip", async () => {
  render(
    <>
      <button type="button">Fermer le dialogue</button>
      <IconButton icon={ArrowUp} label="Monter Cloches" word="Monter" />
    </>,
  );

  // What a dialog does when a click closes it: focus goes back to its opener.
  await userEvent.click(screen.getByRole("button", { name: "Fermer le dialogue" }));
  act(() => screen.getByRole("button", { name: "Monter Cloches" }).focus());

  expect(screen.getByRole("button", { name: "Monter Cloches" })).toHaveFocus();
  expect(screen.queryByRole("tooltip")).toBeNull();
});

test("the word defaults to the label", async () => {
  render(<IconButton icon={ArrowUp} label="Effacer la recherche" />);

  await userEvent.tab();

  expect(await screen.findByRole("tooltip")).toHaveTextContent("Effacer la recherche");
});

test("grow reveals the word only on hover or keyboard focus", () => {
  render(<IconButton icon={Pencil} label="Modifier : Accueil" word="Modifier" mode="grow" />);

  const button = screen.getByRole("button", { name: "Modifier : Accueil" });
  expect(button).toHaveAttribute("data-mode", "grow");
  expect(button).toHaveTextContent("Modifier");

  const wrapper = screen.getByText("Modifier").parentElement;
  const classes = `${wrapper?.className} ${screen.getByText("Modifier").className}`;
  expect(wrapper).toHaveClass("max-w-0");
  expect(classes).toContain("group-hover/icon:");
  expect(classes).toContain("group-focus-visible/icon:");
  // A tap is not a hover: no press state may open it.
  expect(classes).not.toContain("group-active");
  expect(classes).not.toMatch(/(^|\s)hover:/);
});

test("grow with showWord renders the word open", () => {
  render(
    <IconButton icon={Pencil} label="Modifier : Accueil" word="Modifier" mode="grow" showWord />,
  );

  const word = screen.getByText("Modifier");
  expect(word.parentElement).toHaveClass("max-w-56");
  expect(word.parentElement).not.toHaveClass("max-w-0");
  expect(word).not.toHaveClass("opacity-0");
});

test("asChild renders the link with the button look", () => {
  render(
    <MemoryRouter>
      <IconButton asChild icon={Pencil} label="Modifier Carnaval 1990" word="Modifier" mode="grow">
        <Link to="/history/1/edit" />
      </IconButton>
    </MemoryRouter>,
  );

  const link = screen.getByRole("link", { name: "Modifier Carnaval 1990" });
  expect(link).toHaveAttribute("href", "/history/1/edit");
  expect(link).toHaveClass("cursor-pointer");
  expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(link).toHaveTextContent("Modifier");
});

test("a click hides the tip rather than leaving it over the next row", async () => {
  const onClick = vi.fn();
  render(<IconButton icon={ArrowUp} label="Monter Cloches" word="Monter" onClick={onClick} />);

  const button = screen.getByRole("button", { name: "Monter Cloches" });
  await userEvent.hover(button);
  await screen.findByRole("tooltip");
  await userEvent.click(button);

  expect(onClick).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("tooltip")).toBeNull();
});
