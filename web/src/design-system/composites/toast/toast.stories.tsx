import type { Meta, StoryObj } from "@storybook/react-vite";
import { Undo2 } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "../../primitives";
import { raiseToast, ToastOutlet } from "./toast";
import { ToastCard } from "./toast-card";

/**
 * The toast card of ADR 0042. The column says the level and empties from the
 * top as the time runs: 5 s with no action, 10 s with one. A warning and an
 * error stay until closed, with a full column. The clock pauses on hover, on
 * keyboard focus and in a hidden tab.
 *
 * The cards here are frozen (`frozenAt`). The app raises real ones through its
 * `notify`, which passes the translated `closeLabel`.
 */
const meta = {
  title: "Composites/Toast",
  component: ToastCard,
  args: {
    level: "success",
    message: "Texte enregistré.",
    closeLabel: "Fermer",
    frozenAt: 0.6,
    onClose: () => undefined,
  },
  decorators: [
    (Story) => (
      <div className="max-w-[380px] [--width:380px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ToastCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};

export const Info: Story = { args: { level: "info", message: "Page rechargée." } };

/** Stays until closed: no clock, a full column. */
export const Warning: Story = {
  args: { level: "warning", message: "Le texte allemand manque." },
};

export const Failure: Story = {
  name: "Error",
  args: { level: "error", message: "L’enregistrement a échoué." },
};

/** With an action, the clock runs 10 s. */
export const WithAction: Story = {
  args: {
    message: "Réponse modifiée.",
    action: { label: "Annuler", icon: Undo2, onClick: () => undefined },
    frozenAt: 0.8,
  },
};

/** A real toast in the stack, raised the way the app's `notify` does. */
export const Raised: Story = {
  render: () => (
    <>
      <Button
        variant="secondary"
        onClick={() =>
          raiseToast("warning", "Le texte allemand manque.", {
            id: "story",
            closeLabel: "Fermer",
          })
        }
      >
        Lever un avertissement
      </Button>
      <ToastOutlet />
    </>
  ),
  play: async ({ canvas, canvasElement }) => {
    await userEvent.click(canvas.getByRole("button", { name: "Lever un avertissement" }));
    const page = within(canvasElement.ownerDocument.body);
    const message = await page.findByText("Le texte allemand manque.");
    const toast = message.closest<HTMLElement>("[data-sonner-toast]")!;

    await userEvent.click(within(toast).getByRole("button", { name: "Fermer" }));
    await expect(page.queryByText("Le texte allemand manque.")).toBeNull();
  },
};
