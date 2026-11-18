import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";

import { Input } from "../input";
import { Select } from "./select";

/**
 * A bare select has no label, so these stories give it an `aria-label`. In a form it always sits in
 * a FormField, which owns the label and the error wiring.
 */
const meta = {
  title: "Primitives/Select",
  component: Select,
  args: {
    "aria-label": "Pupitre",
    defaultValue: "",
    children: (
      <>
        <option value="">Aucun pupitre</option>
        <option value="1">Cloches</option>
        <option value="2">Trompettes</option>
        <option value="3">Trombones</option>
      </>
    ),
  },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Select>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = { args: { defaultValue: "2" } };

/** `aria-invalid` turns the border to the error colour. The message is FormField's job. */
export const Invalid: Story = { args: { "aria-invalid": true } };

/** The chevron fades with the control. */
export const Disabled: Story = { args: { disabled: true, defaultValue: "1" } };

/** Beside an Input: one height, one border, one radius. */
export const BesideAnInput: Story = {
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Input aria-label="Nom" defaultValue="Marie Dupont" />
      <Select {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox").getBoundingClientRect();
    const select = canvas.getByRole("combobox").getBoundingClientRect();
    await expect(select.height).toBe(input.height);
    await expect(select.width).toBe(input.width);
  },
};

export const Focused: Story = {
  play: async ({ canvas }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("combobox")).toHaveFocus();
  },
};
