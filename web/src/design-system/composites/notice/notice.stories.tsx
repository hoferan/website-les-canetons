import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";

import { Surface } from "../../primitives";
import { Notice } from "./notice";

/**
 * The inline notice of ADR 0042: a note in the flow of the page, at one of
 * the toast's four levels. Flat, with no clock. Info is the default. A ✕ shows
 * only where the screen lets the notice be dismissed.
 */
const meta = {
  title: "Composites/Notice",
  component: Notice,
  args: {
    level: "info",
    children:
      "Ce formulaire est destiné aux visiteurs du site. Les membres joignent le comité directement.",
  },
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Notice>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {};

export const Success: Story = {
  args: { level: "success", children: "Le site a été remplacé." },
};

export const Warning: Story = {
  args: {
    level: "warning",
    children: "Ton mot de passe est provisoire. Choisis-en un nouveau pour continuer.",
  },
};

export const Failure: Story = {
  name: "Error",
  args: { level: "error", children: "Le téléchargement a été refusé. Réessaie dans un moment." },
};

/** "5 événements créés." on the planning: it stays until dismissed. */
export const Dismissible: Story = {
  args: {
    level: "success",
    dismiss: { label: "Masquer", onDismiss: fn() },
    children: (
      <span className="flex flex-wrap items-center gap-x-4">
        <span>5 événements créés.</span>
        <a href="#series" className="inline-flex min-h-touch items-center underline">
          Créer une autre série
        </a>
      </span>
    ),
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Masquer" }));
    await expect(args.dismiss?.onDismiss).toHaveBeenCalledOnce();
  },
};

/** Inside a form's panel, where the light frame keeps it from reading as a field. */
export const InAForm: Story = {
  render: (args) => (
    <Surface variant="form" padding="lg">
      <Notice {...args}>Tu es connecté : ce message part au comité sous ton nom.</Notice>
    </Surface>
  ),
};
