import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, test, vi } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Button, buttonVariants } from "./button";

const FRAMED = ["primary", "secondary", "danger", "accent"] as const;
const ALL = [...FRAMED, "quiet"] as const;

test.each(FRAMED)("%s hovers to a solid colour, never an alpha one", (variant) => {
  const hover = buttonVariants({ variant })
    .split(" ")
    .filter((name) => name.startsWith("hover:bg-"));
  expect(hover).toHaveLength(1);
  // A see-through hover lets a yellow page show through a yellow button.
  expect(hover[0]).not.toContain("/");
});

test.each(ALL)("%s has the hand cursor", (variant) => {
  expect(buttonVariants({ variant }).split(" ")).toContain("cursor-pointer");
});

test.each(FRAMED)("%s presses in onto its shadow", (variant) => {
  const classes = buttonVariants({ variant }).split(" ");
  expect(classes).toContain("active:translate-x-0.5");
  expect(classes).toContain("active:translate-y-0.5");
  expect(classes).toContain("active:shadow-raised-pressed");
  expect(classes).not.toContain("active:scale-[0.98]");
});

test("a stage button keeps a pink shadow when pressed", () => {
  const classes = buttonVariants({ variant: "accent", surface: "stage" }).split(" ");
  expect(classes).toContain("shadow-raised-stage");
  expect(classes).toContain("active:translate-x-[3px]");
  expect(classes).toContain("active:translate-y-[3px]");
  expect(classes).toContain("active:shadow-raised-stage-pressed");
  expect(classes).toContain("focus-ring-stage");
  expect(classes).not.toContain("shadow-raised-sm");
  expect(classes).not.toContain("active:shadow-raised-pressed");
});

// The press itself is CSS (press-quiet in styles.css), measured in a browser
// by e2e/quiet-press.spec.ts. Here: the class is there and nothing in the
// variant moves the button on its own, which would carry the line along.
test("quiet presses onto its line", () => {
  const classes = buttonVariants({ variant: "quiet" }).split(" ");
  expect(classes).toContain("press-quiet");
  expect(classes).toContain("relative");
  expect(classes.some((name) => name.startsWith("active:translate"))).toBe(false);
});

test.each(FRAMED)("%s has the button radius", (variant) => {
  expect(buttonVariants({ variant }).split(" ")).toContain("rounded-button");
});

test("the default is primary", () => {
  expect(buttonVariants({})).toBe(buttonVariants({ variant: "primary" }));
});

// ---- Rendered contract ------------------------------------------------------

describe("Button", () => {
  test("is a button with its label as its name, and forwards ref and className", () => {
    const ref = createRef<HTMLButtonElement>();
    render(
      <Button ref={ref} className="px-8">
        Envoyer
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Envoyer" });
    expect(ref.current).toBe(button);
    // The caller's padding replaces the size's, instead of sitting beside it.
    expect(button).toHaveClass("px-8");
    expect(button).not.toHaveClass("px-4");
    expect(button).toHaveAttribute("data-slot", "button");
  });

  test("asChild gives a link the button's looks without a nested button", () => {
    render(
      <Button asChild>
        <a href="/agenda">Agenda</a>
      </Button>,
    );
    const link = screen.getByRole("link", { name: "Agenda" });
    expect(link).toHaveClass("rounded-button");
    expect(screen.queryByRole("button")).toBeNull();
  });

  test("Enter and Space activate it", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Go</Button>);
    await user.tab();
    await user.keyboard("{Enter}");
    await user.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
  });

  test("loading is busy and aria-disabled, never disabled, and ignores clicks", async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(
      <Button loading onClick={onClick}>
        Envoyer
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Envoyer" });
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveAttribute("aria-disabled", "true");
    // `disabled` would blur a focused submit button to <body>.
    expect(button).not.toBeDisabled();
    await user.click(button);
    expect(onClick).not.toHaveBeenCalled();
  });

  test("loading keeps the label and adds a hidden spinner", () => {
    render(<Button loading>Envoyer</Button>);
    const button = screen.getByRole("button");
    expect(button).toHaveTextContent("Envoyer");
    expect(button.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  });

  test("not loading carries no busy or disabled state", () => {
    render(<Button>Envoyer</Button>);
    const button = screen.getByRole("button");
    expect(button).not.toHaveAttribute("aria-busy");
    expect(button).not.toHaveAttribute("aria-disabled");
  });

  test.each(ALL)("%s has no structural accessibility violations", async (variant) => {
    const { container } = render(<Button variant={variant}>Envoyer</Button>);
    await expectNoA11yViolations(container);
  });

  test("the stage surface and a loading state have none either", async () => {
    const { container } = render(
      <div>
        <Button surface="stage">Connexion</Button>
        <Button loading>Envoi</Button>
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
