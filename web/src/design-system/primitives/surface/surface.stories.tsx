import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent } from "storybook/test";

import { Surface } from "./surface";

const meta = {
  title: "Primitives/Surface",
  component: Surface,
  args: { children: "Répétition, mercredi 19 h" },
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {};

export const Feature: Story = { args: { variant: "feature", children: "Nous rejoindre" } };

export const Form: Story = {
  args: { variant: "form", padding: "lg", children: "Vos coordonnées" },
};

export const Placeholder: Story = {
  args: { variant: "placeholder", children: "Nouveau rôle" },
};

/** Tiles on a coloured band lean one way, then the other. */
export const Tilted: Story = {
  render: () => (
    <ul className="grid grid-cols-2 gap-5 bg-yellow p-6">
      <Surface as="li" variant="feature" tilt="left">
        Les Canetons
      </Surface>
      <Surface as="li" variant="feature" tilt="right">
        Le comité
      </Surface>
    </ul>
  ),
};

/**
 * A whole tile that is one link. The play function tabs to it and checks the
 * focus ring is drawn, two pixels wide, in the focus colour.
 */
export const Interactive: Story = {
  render: () => (
    <ul className="bg-yellow p-6">
      <li>
        <Surface asChild interactive variant="feature" tilt="left">
          <a href="#comite">
            <span className="font-display text-xl">Le comité</span>
            <span className="block">Nous écrire, et qui fait quoi.</span>
          </a>
        </Surface>
      </li>
    </ul>
  ),
  play: async ({ canvas }) => {
    await userEvent.tab();
    const link = canvas.getByRole("link");
    await expect(link).toHaveFocus();
    const style = getComputedStyle(link);
    await expect(style.outlineStyle).toBe("solid");
    await expect(style.outlineWidth).toBe("2px");
  },
};

/**
 * Every variant side by side. The play function measures that they share one
 * radius, and that only the placeholder goes without a fill.
 */
export const Variants: Story = {
  render: () => (
    <div className="grid gap-5 sm:grid-cols-2">
      <Surface data-testid="list">list</Surface>
      <Surface variant="feature" data-testid="feature">
        feature
      </Surface>
      <Surface variant="form" padding="lg" data-testid="form">
        form
      </Surface>
      <Surface variant="placeholder" data-testid="placeholder">
        placeholder
      </Surface>
    </div>
  ),
  play: async ({ canvas }) => {
    const radii = ["list", "feature", "form", "placeholder"].map(
      (id) => getComputedStyle(canvas.getByTestId(id)).borderTopLeftRadius,
    );
    await expect(new Set(radii)).toEqual(new Set(["18px"]));
    await expect(getComputedStyle(canvas.getByTestId("placeholder")).borderTopStyle).toBe("dashed");
  },
};
