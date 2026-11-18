import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";

import { Input } from "../input";
import { Textarea } from "./textarea";

/**
 * A bare textarea has no label, so these stories give it an `aria-label`. In a form it always sits
 * in a FormField, which owns the label and the error wiring.
 */
const meta = {
  title: "Primitives/Textarea",
  component: Textarea,
  args: { "aria-label": "Message", rows: 6 },
  decorators: [
    (Story) => (
      <div className="w-72">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Textarea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithValue: Story = {
  args: { defaultValue: "Bonjour,\nNous aimerions vous engager pour notre fête.\nMerci !" },
};

export const WithPlaceholder: Story = { args: { placeholder: "Votre message" } };

/** `aria-invalid` turns the border to the error colour. The message is FormField's job. */
export const Invalid: Story = { args: { "aria-invalid": true } };

export const Disabled: Story = { args: { disabled: true, defaultValue: "Non modifiable" } };

/** Beside an Input: one border, one radius, one width, one ground. */
export const BesideAnInput: Story = {
  args: { rows: 3 },
  render: (args) => (
    <div className="flex flex-col gap-2">
      <Input aria-label="Nom" defaultValue="Marie Dupont" />
      <Textarea {...args} />
    </div>
  ),
  play: async ({ canvas }) => {
    const input = canvas.getByRole("textbox", { name: "Nom" });
    const textarea = canvas.getByRole("textbox", { name: "Message" });
    await expect(textarea.getBoundingClientRect().width).toBe(input.getBoundingClientRect().width);
    const look = (element: HTMLElement) => {
      const style = getComputedStyle(element);
      return [style.borderTopColor, style.borderTopWidth, style.borderTopLeftRadius];
    };
    await expect(look(textarea)).toEqual(look(input));
  },
};

/** Tab onto it: the ring is Input's, the shared `focus-ring` (#391). */
export const Focused: Story = {
  play: async ({ canvas }) => {
    await userEvent.tab();
    const textarea = canvas.getByRole("textbox");
    await expect(textarea).toHaveFocus();
    const style = getComputedStyle(textarea);
    await expect(style.outlineStyle).toBe("solid");
    await expect(style.outlineWidth).toBe("2px");
    await expect(style.outlineOffset).toBe("2px");
  },
};
