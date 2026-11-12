import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, test } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Input } from "./input";

describe("Input", () => {
  test("is a textbox that forwards ref, className and native attributes", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Input ref={ref} aria-label="Nom" className="pr-12" autoComplete="family-name" />);
    const input = screen.getByRole("textbox", { name: "Nom" });
    expect(ref.current).toBe(input);
    expect(input).toHaveClass("pr-12");
    expect(input).toHaveAttribute("autocomplete", "family-name");
    expect(input).toHaveAttribute("data-slot", "input");
  });

  test("takes typing", async () => {
    const user = userEvent.setup();
    render(<Input aria-label="Nom" />);
    await user.type(screen.getByRole("textbox"), "Dupont");
    expect(screen.getByRole("textbox")).toHaveValue("Dupont");
  });

  test("has the 44px touch floor, the control radius and the shared focus ring", () => {
    render(<Input aria-label="Nom" />);
    expect(screen.getByRole("textbox")).toHaveClass("min-h-touch", "rounded-control", "focus-ring");
  });

  test("is styled as invalid only when told so", () => {
    const { rerender } = render(<Input aria-label="Nom" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
    rerender(<Input aria-label="Nom" aria-invalid />);
    expect(screen.getByRole("textbox")).toBeInvalid();
  });

  test("a labelled input has no structural accessibility violations", async () => {
    const { container } = render(
      <div>
        <label htmlFor="n">Nom</label>
        <Input id="n" />
        <Input aria-label="Courriel" aria-invalid disabled />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
