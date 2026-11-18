import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent } from "storybook/test";

import { measureFocusRing } from "../../internal/testing/focus-ring";
import { RadioGroup, ToggleOption } from "./radio-group";

/** Controlled, as /events holds its view in the screen's own state. */
function Views({ initial = "planning" }: { initial?: string }) {
  const [view, setView] = useState(initial);
  return (
    <RadioGroup
      value={view}
      onValueChange={setView}
      orientation="horizontal"
      aria-label="Vue du planning"
    >
      <ToggleOption value="planning">Planning</ToggleOption>
      <ToggleOption value="past">Passés</ToggleOption>
      <ToggleOption value="drafts">Brouillons</ToggleOption>
    </RadioGroup>
  );
}

const meta = {
  title: "Primitives/RadioGroup",
  component: RadioGroup,
  render: () => <Views />,
} satisfies Meta<typeof RadioGroup>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The first option on: a segment shows its state by filling. */
export const Default: Story = {};

/** Another option on. A radio group cannot be cleared, so one always is. */
export const OtherChosen: Story = { render: () => <Views initial="drafts" /> };

/** A click chooses an option. */
export const Chosen: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByRole("radio", { name: "Passés" }));
    await expect(canvas.getByRole("radio", { name: "Passés" })).toBeChecked();
    await expect(canvas.getByRole("radio", { name: "Planning" })).not.toBeChecked();
  },
};

/**
 * Tab onto the chosen option, then arrow onto one that was not: the ring is
 * the one `focus-ring` on both, and it measures at least 3:1 against the
 * group's ground (#391).
 *
 * In a browser the arrow also chooses the option it lands on. Radix does that
 * only for a real key press, which this synthetic one is not, so
 * web/e2e/members.spec.ts checks it.
 */
export const Focused: Story = {
  play: async ({ canvas }) => {
    await userEvent.tab();
    const planning = canvas.getByRole("radio", { name: "Planning" });
    await expect(planning).toHaveFocus();
    let measured = await measureFocusRing(planning);
    await expect(measured.ring).toBe("solid 2px");
    await expect(measured.contrast).toBeGreaterThanOrEqual(3);

    await userEvent.keyboard("{ArrowRight}");
    const past = canvas.getByRole("radio", { name: "Passés" });
    await expect(past).toHaveFocus();
    measured = await measureFocusRing(past);
    await expect(measured.ring).toBe("solid 2px");
    await expect(measured.contrast).toBeGreaterThanOrEqual(3);
  },
};
