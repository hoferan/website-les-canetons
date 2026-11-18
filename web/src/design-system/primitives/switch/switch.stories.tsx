import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";

import { measureFocusRing } from "../../internal/testing/focus-ring";
import { Switch } from "./switch";

/**
 * A switch always sits in a row at least `min-h-touch` high with its visible
 * label beside it, as on /events/tags and in the inbox.
 */
const meta = {
  title: "Primitives/Switch",
  component: Switch,
  render: (args) => (
    <label className="flex min-h-touch items-center gap-3">
      <Switch {...args} />
      Fêter cet événement
    </label>
  ),
} satisfies Meta<typeof Switch>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Off: Story = {};

export const On: Story = { args: { defaultChecked: true } };

/**
 * Busy while its write is under way: `aria-disabled`, so a focused switch
 * keeps the focus. The caller also returns early from `onCheckedChange`.
 */
export const Busy: Story = { args: { defaultChecked: true, "aria-disabled": true } };

/** Inert for the life of the screen. */
export const Disabled: Story = { args: { disabled: true } };

export const Flipped: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Fêter cet événement"));
    await expect(canvas.getByRole("switch")).toBeChecked();
  },
};

/**
 * Tab onto each state: the ring is the one `focus-ring`, and it measures at
 * least 3:1 on the cream page whether the track is on or off (#391).
 */
export const Focused: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <label className="flex min-h-touch items-center gap-3">
        <Switch />
        Éteint
      </label>
      <label className="flex min-h-touch items-center gap-3">
        <Switch defaultChecked />
        Allumé
      </label>
    </div>
  ),
  play: async ({ canvas }) => {
    for (const name of ["Éteint", "Allumé"]) {
      await userEvent.tab();
      const control = canvas.getByRole("switch", { name });
      await expect(control).toHaveFocus();
      const { ring, contrast } = await measureFocusRing(control);
      await expect(ring).toBe("solid 2px");
      await expect(contrast).toBeGreaterThanOrEqual(3);
    }
  },
};
