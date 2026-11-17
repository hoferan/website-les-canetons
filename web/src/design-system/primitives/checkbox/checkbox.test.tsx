import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, test } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
  test("is a checkbox that forwards ref, className and native attributes", () => {
    const ref = createRef<HTMLInputElement>();
    render(<Checkbox ref={ref} aria-label="Visible" className="mt-0" name="visible" />);
    const box = screen.getByRole("checkbox", { name: "Visible" });
    expect(ref.current).toBe(box);
    expect(box).toHaveClass("mt-0");
    expect(box).toHaveAttribute("name", "visible");
    expect(box).toHaveAttribute("data-slot", "checkbox");
  });

  // jsdom has no layout, so this pins the classes; the story measures the box.
  test("keeps a 20px box that a wrapping label cannot squeeze", () => {
    render(<Checkbox aria-label="Visible" />);
    expect(screen.getByRole("checkbox")).toHaveClass("size-5", "shrink-0", "focus-ring");
  });

  test("toggles from its label", async () => {
    const user = userEvent.setup();
    render(
      <label>
        <Checkbox /> Visible
      </label>,
    );
    await user.click(screen.getByText("Visible"));
    expect(screen.getByRole("checkbox", { name: "Visible" })).toBeChecked();
  });

  test("a labelled checkbox has no structural accessibility violations", async () => {
    const { container } = render(
      <div>
        <label>
          <Checkbox defaultChecked /> Visible
        </label>
        <Checkbox id="b" aria-describedby="b-hint" disabled />
        <label htmlFor="b">Membre</label>
        <span id="b-hint">Tous les comptes ont ce rôle.</span>
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
