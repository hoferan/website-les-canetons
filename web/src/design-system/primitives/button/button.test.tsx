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

// The offset is the surface's, 3px on the page and 4px on the stage, so the
// press reads the same variable. The colours are checked in a browser by the
// OnTheStage story; jsdom resolves no custom property.
test.each(FRAMED)("%s presses in onto its shadow, by the surface's offset", (variant) => {
  const classes = buttonVariants({ variant }).split(" ");
  expect(classes).toContain("shadow-raised-sm");
  expect(classes).toContain("active:translate-x-[calc(var(--raised-offset)-1px)]");
  expect(classes).toContain("active:translate-y-[calc(var(--raised-offset)-1px)]");
  expect(classes).toContain("active:shadow-raised-pressed");
  expect(classes).not.toContain("active:scale-[0.98]");
});

test.each(ALL)("%s carries the one focus ring, whatever the surface", (variant) => {
  expect(buttonVariants({ variant }).split(" ")).toContain("focus-ring");
});

test("a button does not say which surface it sits on", () => {
  render(<Button>Envoyer</Button>);
  expect(screen.getByRole("button")).not.toHaveAttribute("data-surface");
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

// Each size is exactly one height, padding and text size (#397). jsdom computes
// no layout, so the Sizes story measures the pixels.
test.each([
  ["sm", "h-touch", "px-3", "text-sm"],
  ["md", "h-touch", "px-4", "text-sm"],
  ["lg", "h-12", "px-5", "text-base"],
] as const)("%s is one height, one padding, one text size", (size, height, padding, text) => {
  const classes = buttonVariants({ size }).split(" ");
  expect(classes).toEqual(expect.arrayContaining([height, padding, text]));
  expect(classes.filter((name) => /^(?:h-|px-|text-(?:xs|sm|base|lg))/.test(name))).toHaveLength(3);
  expect(classes.some((name) => name.startsWith("has-[>svg]:px"))).toBe(false);
});

test("the default size is md", () => {
  expect(buttonVariants({})).toBe(buttonVariants({ size: "md" }));
  render(<Button>Envoyer</Button>);
  expect(screen.getByRole("button")).toHaveAttribute("data-size", "md");
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

  // A caller may pass aria-disabled for a reason of its own, such as a form
  // with nothing to create yet, and `false` the rest of the time.
  test("loading stays aria-disabled whatever aria-disabled the caller passes", () => {
    render(
      <Button loading aria-disabled={false}>
        Envoyer
      </Button>,
    );
    expect(screen.getByRole("button")).toHaveAttribute("aria-disabled", "true");
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
      <div data-surface="stage">
        <Button>Connexion</Button>
        <Button loading>Envoi</Button>
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
