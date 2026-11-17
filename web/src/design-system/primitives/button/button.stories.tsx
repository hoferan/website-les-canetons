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
    size: { control: "select", options: ["sm", "md", "lg"] },
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
 * The three sizes, each one height, one padding and one text size (#397). lg is for hero actions
 * and form action rows, sm for compact rows, md for everything else. An icon does not change the
 * padding.
 */
export const Sizes: Story = {
  render: (args) => (
    <div className="grid gap-4">
      {(["sm", "md", "lg"] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-4">
          <Button {...args} size={size}>
            {size}
          </Button>
          <Button {...args} size={size}>
            <Plus aria-hidden="true" />
            {`${size} icône`}
          </Button>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvas }) => {
    const expected = { sm: [44, 12, 14], md: [44, 16, 14], lg: [48, 20, 16] } as const;
    for (const [size, triple] of Object.entries(expected)) {
      for (const name of [size, `${size} icône`]) {
        const style = getComputedStyle(canvas.getByRole("button", { name }));
        await expect([style.height, style.paddingLeft, style.fontSize]).toEqual(
          triple.map((px) => `${px}px`),
        );
      }
    }
  },
};

/**
 * The same button on the cream page and on the black stage. The stage is any element with
 * `data-surface="stage"` (the header, the footer, the phone menu): inside it the shadow turns pink
 * and 4px and the focus ring white, and the button is passed nothing.
 */
export const OnTheStage: Story = {
  args: { variant: "accent" },
  render: (args) => (
    <div className="flex flex-wrap gap-4">
      <div className="rounded-xl bg-ground p-6">
        <Button {...args}>Sur la page</Button>
      </div>
      <div data-surface="stage" className="rounded-xl bg-stage p-6">
        <Button {...args}>Sur la scène</Button>
      </div>
    </div>
  ),
  play: async ({ canvas }) => {
    const page = canvas.getByRole("button", { name: "Sur la page" });
    const stage = canvas.getByRole("button", { name: "Sur la scène" });
    await expect(getComputedStyle(page).boxShadow).toContain("rgb(20, 18, 28) 3px 3px");
    await expect(getComputedStyle(stage).boxShadow).toContain("rgb(255, 61, 154) 4px 4px");
    // The colour `focus-ring` paints with. The ring itself needs :focus-visible, which a
    // simulated Tab does not set.
    const focus = (button: HTMLElement) =>
      getComputedStyle(button).getPropertyValue("--color-focus").trim();
    await expect(focus(page)).toBe("#4b2ed6");
    await expect(focus(stage)).toBe("#fff");
  },
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
