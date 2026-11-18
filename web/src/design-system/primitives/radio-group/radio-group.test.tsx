import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { RadioGroup, ToggleOption } from "./radio-group";

/**
 * A controlled harness, because that is how /events uses it: the value is the
 * screen's own state.
 */
function Harness() {
  const [view, setView] = useState("planning");
  return (
    <RadioGroup
      value={view}
      orientation="horizontal"
      aria-label="Vue du planning"
      onValueChange={setView}
    >
      <ToggleOption value="planning">Planning</ToggleOption>
      <ToggleOption value="past">Passés</ToggleOption>
    </RadioGroup>
  );
}

describe("RadioGroup", () => {
  it("is a named radiogroup whose items carry the checked state", () => {
    render(<Harness />);

    const group = screen.getByRole("radiogroup", { name: "Vue du planning" });
    expect(group).toHaveAttribute("aria-orientation", "horizontal");
    expect(screen.getByRole("radio", { name: "Planning" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Passés" })).not.toBeChecked();
  });

  it("moves the checked state when another option is chosen", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("radio", { name: "Passés" }));

    expect(screen.getByRole("radio", { name: "Passés" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Planning" })).not.toBeChecked();
  });

  /**
   * Why no call site needs an empty-value guard: a radio group cannot be
   * cleared by its user.
   */
  it("keeps the checked option checked when it is pressed again", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("radio", { name: "Planning" }));

    expect(screen.getByRole("radio", { name: "Planning" })).toBeChecked();
  });

  // jsdom paints nothing, so this pins the class; the story measures the ring.
  it("wears the one focus ring on each option, not a ring of its own", () => {
    render(<Harness />);

    for (const option of screen.getAllByRole("radio")) {
      expect(option).toHaveClass("focus-ring");
      expect(option.className).not.toMatch(/\bring-/);
    }
  });

  it("a named group has no structural accessibility violations", async () => {
    const { container } = render(<Harness />);
    await expectNoA11yViolations(container);
  });
});

// Two behaviours are asserted in web/e2e/members.spec.ts instead, in a real
// browser. The 44px floor, because jsdom computes no layout and a className
// check passes even when the token is misspelled or overridden. Arrow-key
// selection, because Radix needs real focus events for it and under jsdom
// {ArrowRight} leaves aria-checked false.
