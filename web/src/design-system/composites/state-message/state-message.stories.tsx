import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";

import { Button } from "../../primitives";
import { StateMessage } from "./state-message";

/**
 * What a list region says while it loads, when it has nothing, and when it
 * failed (#387). The caller maps its query's state onto `state`; the error
 * always offers Réessayer.
 */
// Typed with an annotation, not `satisfies`: the props are a union by
// `state`, and Storybook's inference from `satisfies` narrows it to never.
const meta: Meta<typeof StateMessage> = {
  title: "Composites/StateMessage",
  component: StateMessage,
  decorators: [
    (Story) => (
      <div className="max-w-2xl">
        <Story />
      </div>
    ),
  ],
};

export default meta;
type Story = StoryObj<typeof StateMessage>;

export const Loading: Story = {
  args: { state: "loading", label: "Chargement…", rows: 3, rowHeight: 6 },
};

export const Empty: Story = {
  args: {
    state: "empty",
    title: "Aucun événement au planning.",
    description: "Ajoutez un événement, ou générez toute une saison d’un coup.",
    action: (
      <Button asChild>
        <a href="#series">Ajouter une série</a>
      </Button>
    ),
  },
};

/** A search that matched nothing: no next step to offer. */
export const EmptyWithoutAction: Story = {
  args: { state: "empty", title: "Aucun événement ne correspond à cette recherche." },
};

export const Failure: Story = {
  name: "Error",
  args: {
    state: "error",
    title: "Le planning n’a pas pu être chargé.",
    description: "Vérifiez la connexion, puis réessayez.",
    retry: { label: "Réessayer", onRetry: fn() },
  },
  play: async ({ args, canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "Réessayer" }));
    if (args.state === "error") await expect(args.retry.onRetry).toHaveBeenCalledOnce();
  },
};

/** A retry in flight: the error stays, the button turns busy and keeps focus. */
export const Retrying: Story = {
  args: {
    state: "error",
    title: "Le planning n’a pas pu être chargé.",
    description: "Vérifiez la connexion, puis réessayez.",
    retry: { label: "Réessayer", onRetry: fn(), busy: true },
  },
};

/** Fails, retries for a second, fails again: the alert is put back each time. */
export const RetryThatFailsAgain: Story = {
  args: Failure.args,
  render: function Render() {
    const [busy, setBusy] = useState(false);
    return (
      <StateMessage
        state="error"
        title="Le planning n’a pas pu être chargé."
        description="Vérifiez la connexion, puis réessayez."
        retry={{
          label: "Réessayer",
          busy,
          onRetry: () => {
            setBusy(true);
            setTimeout(() => setBusy(false), 1000);
          },
        }}
      />
    );
  },
};
