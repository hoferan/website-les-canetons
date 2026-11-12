import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";

import { Input } from "./input";

/**
 * A bare input has no label, so these stories give it an `aria-label`. In a form it always sits in
 * a FormField, which owns the label and the error wiring.
 */
const meta = {
  title: "Primitives/Input",
  component: Input,
  args: { "aria-label": "Nom", placeholder: "Dupont" },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = { args: { defaultValue: "Marie Dupont" } };

/** `aria-invalid` turns the border to the error colour. The message is FormField's job. */
export const Invalid: Story = { args: { "aria-invalid": true, defaultValue: "pas un courriel" } };

export const Disabled: Story = { args: { disabled: true, defaultValue: "Non modifiable" } };

export const Password: Story = { args: { type: "password", "aria-label": "Mot de passe" } };

export const Focused: Story = {
  play: async ({ canvas }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("textbox")).toHaveFocus();
  },
};
