import type { Meta, StoryObj } from "@storybook/react-vite";

import { Button } from "../../primitives";
import { FormActions } from "./form-actions";

/**
 * The one footer for every form and dialog. The confirm comes first, then
 * Cancel, then a quiet action, which goes to the far end from `sm`. On a
 * phone the buttons stack full width with the confirm on top; switch the
 * viewport to see it.
 */
const meta = {
  title: "Composites/FormActions",
  component: FormActions,
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FormActions>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SaveAndCancel: Story = {
  args: {
    children: (
      <>
        <Button size="lg">Enregistrer</Button>
        <Button size="lg" variant="secondary">
          Annuler
        </Button>
      </>
    ),
  },
};

/** A quiet reset sits at the far end of the row. */
export const WithQuietAction: Story = {
  args: {
    children: (
      <>
        <Button size="lg">Enregistrer</Button>
        <Button size="lg" variant="secondary">
          Annuler
        </Button>
        <Button size="lg" variant="quiet">
          Réinitialiser
        </Button>
      </>
    ),
  },
};
