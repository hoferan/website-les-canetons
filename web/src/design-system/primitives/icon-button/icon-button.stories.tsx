import type { Meta, StoryObj } from "@storybook/react-vite";
import { ArrowDown, ArrowUp, Pencil, Trash2, X } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

import { measureFocusRing } from "../../internal/testing/focus-ring";
import { IconButton } from "./icon-button";

const meta = {
  title: "Primitives/IconButton",
  component: IconButton,
  args: { icon: ArrowUp, label: "Monter Cloches", word: "Monter" },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Secondary is the default: a row's move, edit and remove buttons. */
export const Secondary: Story = {};

export const Primary: Story = { args: { variant: "primary", icon: Pencil, label: "Modifier" } };

export const Danger: Story = {
  args: { variant: "danger", icon: Trash2, label: "Supprimer Cloches", word: "Supprimer" },
};

/** Quiet stays flat: the clear button inside a search field, a dialog's close. */
export const Quiet: Story = { args: { variant: "quiet", icon: X, label: "Fermer" } };

/** Both sizes are the 44px touch target; `sm` only marks a denser row. */
export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-3">
      <IconButton icon={ArrowUp} label="Monter" />
      <IconButton icon={ArrowDown} label="Descendre" size="sm" />
    </div>
  ),
};

/** Busy or not allowed: `aria-disabled`, so a focused button keeps its focus. */
export const Unavailable: Story = { args: { "aria-disabled": true } };

/** A link with the button's look, the icon and the word. */
export const AsLink: Story = {
  args: { asChild: true, icon: Pencil, label: "Modifier Carnaval 1990", word: "Modifier" },
  render: (args) => (
    <IconButton {...args}>
      <a href="#history-1990" />
    </IconButton>
  ),
};

/** The word, kept open as it shows on hover and on keyboard focus. */
export const WordShown: Story = { args: { showWord: true } };

/**
 * Tab onto it: the word shows above it, and the ring is the one `focus-ring`
 * at 3:1 or better on the cream page.
 */
export const Focused: Story = {
  play: async ({ canvas, canvasElement }) => {
    await userEvent.tab();
    const button = canvas.getByRole("button", { name: "Monter Cloches" });
    await expect(button).toHaveFocus();
    const tip = await within(canvasElement.ownerDocument.body).findByRole("tooltip");
    await expect(tip).toHaveTextContent("Monter");
    const { ring, contrast } = await measureFocusRing(button);
    await expect(ring).toBe("solid 2px");
    await expect(contrast).toBeGreaterThanOrEqual(3);
  },
};
