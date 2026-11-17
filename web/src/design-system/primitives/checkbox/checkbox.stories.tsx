import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";

import { Checkbox } from "./checkbox";

/**
 * A checkbox always sits beside its label. The stories put it in the two rows
 * the app uses: a one-line label (`items-center`) and a label with a hint
 * that wraps (`items-start`), the row where a box without `shrink-0` is squeezed.
 */
const meta = {
  title: "Primitives/Checkbox",
  component: Checkbox,
  decorators: [
    (Story) => (
      <div className="w-60">
        <Story />
      </div>
    ),
  ],
  render: (args) => (
    <label className="flex min-h-touch items-center gap-2">
      <Checkbox {...args} />
      Visible sur le site public
    </label>
  ),
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = { args: { defaultChecked: true } };

/** Inert for the life of the form, as the baseline role is in the member editor. */
export const Disabled: Story = { args: { disabled: true, defaultChecked: true } };

/** The row the role editor uses: the hint describes the box and is not part of its name. */
export const WrappingLabel: Story = {
  render: (args) => (
    <div className="flex min-h-touch items-start gap-2 py-1">
      <Checkbox id="story-texts" aria-describedby="story-texts-hint" {...args} />
      <div>
        <label htmlFor="story-texts">Modifier les textes du site</label>
        <span id="story-texts-hint" className="block text-sm text-ink-muted">
          Change les textes et les coordonnées des pages publiques, là où ils s’affichent.
        </span>
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const box = canvas.getByRole("checkbox", { name: "Modifier les textes du site" });
    const { width, height } = box.getBoundingClientRect();
    await expect([width, height]).toEqual([20, 20]);
  },
};

export const Toggled: Story = {
  play: async ({ canvas }) => {
    await userEvent.click(canvas.getByText("Visible sur le site public"));
    await expect(canvas.getByRole("checkbox")).toBeChecked();
  },
};
