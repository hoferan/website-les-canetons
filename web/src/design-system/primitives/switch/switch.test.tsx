import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef, useState } from "react";
import { describe, expect, test, vi } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Switch } from "./switch";

/** Busy the way the callers do it: aria-disabled and an early return. */
function Harness({ busy = false }: { busy?: boolean }) {
  const [on, setOn] = useState(false);
  return (
    <label className="flex items-center gap-2">
      <Switch
        checked={on}
        aria-disabled={busy}
        onCheckedChange={(next) => {
          if (busy) return;
          setOn(next);
        }}
      />
      Fêter
    </label>
  );
}

describe("Switch", () => {
  test("is a switch named by its label, forwarding ref and className", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Switch ref={ref} aria-label="Afficher les messages lus" className="ml-auto" />);

    const control = screen.getByRole("switch", { name: "Afficher les messages lus" });
    expect(ref.current).toBe(control);
    expect(control).toHaveClass("ml-auto");
    expect(control).toHaveAttribute("data-slot", "switch");
    expect(control).not.toBeChecked();
  });

  test("flips on a click and on Space", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const control = screen.getByRole("switch", { name: "Fêter" });

    await user.click(control);
    expect(control).toBeChecked();

    await user.keyboard(" ");
    expect(control).not.toBeChecked();
  });

  test("busy, it keeps the focus and does not flip", async () => {
    const user = userEvent.setup();
    const onFlip = vi.fn();
    render(
      <>
        <Harness busy />
        <Switch aria-label="Autre" onCheckedChange={onFlip} />
      </>,
    );
    const control = screen.getByRole("switch", { name: "Fêter" });

    await user.click(control);

    expect(control).toHaveFocus();
    expect(control).not.toBeChecked();
    expect(onFlip).not.toHaveBeenCalled();
  });

  // jsdom paints nothing, so this pins the class; the story measures the ring.
  test("wears the one focus ring, not a ring of its own", () => {
    render(<Switch aria-label="Fêter" />);
    const control = screen.getByRole("switch");
    expect(control).toHaveClass("focus-ring");
    expect(control.className).not.toMatch(/\bring-/);
  });

  test("on, off and busy switches have no structural accessibility violations", async () => {
    const { container } = render(
      <div>
        <Harness />
        <Switch aria-label="Allumé" defaultChecked />
        <Switch aria-label="Occupé" aria-disabled="true" />
        <Switch aria-label="Inactif" disabled />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
