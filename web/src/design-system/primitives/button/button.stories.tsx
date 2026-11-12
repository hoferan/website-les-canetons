import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowRight, Plus } from "lucide-react";
import { expect, userEvent } from "storybook/test";

import { Button } from "./button";

const meta = {
  title: "Primitives/Button",
  component: Button,
  args: { children: "Envoyer" },
  argTypes: {
    variant: { control: "select", options: ["primary", "secondary", "danger", "accent", "quiet"] },
    size: { control: "select", options: ["default", "xs", "sm", "lg"] },
    surface: { control: "radio", options: ["page", "stage"] },
    loading: { control: "boolean" },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {};

/** Every role variant on the cream page. Variants are named by role, not by look (ADR 0040). */
export const Variants: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      {(["primary", "secondary", "danger", "accent", "quiet"] as const).map((variant) => (
        <Button key={variant} {...args} variant={variant}>
          {variant}
        </Button>
      ))}
    </div>
  ),
};

/**
 * The sizes. They all render at least 44px tall: the touch floor beats the size's own height, so
 * they differ only in padding and text size (#397).
 */
export const Sizes: Story = {
  render: (args) => (
    <div className="flex flex-wrap items-center gap-4">
      {(["xs", "sm", "default", "lg"] as const).map((size) => (
        <Button key={size} {...args} size={size}>
          {size}
        </Button>
      ))}
    </div>
  ),
};

/** On the black stage the shadow turns pink and the focus ring white. */
export const OnTheStage: Story = {
  args: { surface: "stage", variant: "accent" },
  globals: { backgrounds: { value: "stage" } },
};

export const WithIcon: Story = {
  render: (args) => (
    <div className="flex gap-4">
      <Button {...args}>
        <Plus aria-hidden="true" />
        Ajouter
      </Button>
      <Button {...args} variant="secondary">
        Suivant
        <ArrowRight aria-hidden="true" />
      </Button>
    </div>
  ),
};

/** `aria-disabled`, never the `disabled` attribute: a focused submit must keep its focus. */
export const Disabled: Story = { args: { "aria-disabled": true } };

/** Busy and aria-disabled, with a spinner; clicks are ignored and the label keeps its width. */
export const Loading: Story = { args: { loading: true, children: "Envoi…" } };

/** `asChild` gives any element, here a link, the button's looks. */
export const AsLink: Story = {
  render: (args) => (
    <Button {...args} asChild>
      <a href="#agenda">Voir l’agenda</a>
    </Button>
  ),
};

/** Tab onto the button: the ring is the single `focus-ring` utility. */
export const Focused: Story = {
  play: async ({ canvas }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("button")).toHaveFocus();
  },
};
