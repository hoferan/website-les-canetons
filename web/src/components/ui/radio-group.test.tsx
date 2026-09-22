import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";

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
   * THE REASON NO CALL SITE NEEDS AN EMPTY-VALUE GUARD. A ToggleGroup would
   * have fired onValueChange("") here, which for /events would have meant a
   * planning that is neither upcoming nor past. A radio group cannot be
   * cleared by its user, and this is what says so.
   */
  it("keeps the checked option checked when it is pressed again", async () => {
    const user = userEvent.setup();
    render(<Harness />);

    await user.click(screen.getByRole("radio", { name: "Planning" }));

    expect(screen.getByRole("radio", { name: "Planning" })).toBeChecked();
  });
});

// TWO ASSERTIONS DELIBERATELY ABSENT, both tried first:
//
// THE 44px FLOOR. jsdom computes no layout, so all this file could check is
// that the token "min-h-touch" appears in a className — which passes just as
// happily if the token is misspelled, if styles.css stops defining
// --spacing-touch, or if a later class in the cascade overrides the height.
//
// ARROW-KEY SELECTION. Radix selects on arrow by calling click() from the
// item's onFocus while an arrow is held, and that needs real focus events:
// under jsdom {ArrowRight} leaves aria-checked false. It is the behaviour this
// primitive was chosen FOR, so it is asserted rather than dropped —
// just not here.
//
// Both live in web/e2e/members.spec.ts, measured in a real browser.
