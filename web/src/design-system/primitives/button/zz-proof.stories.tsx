import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

import { Button } from "./button";

// TEMPORARY: proves the CI step fails (#404). Reverted in the next commit.
const meta = { title: "Proof/Must fail", component: Button } satisfies Meta<typeof Button>;
export default meta;
type Story = StoryObj<typeof meta>;

export const FailingPlay: Story = {
  args: { children: "Envoyer" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toHaveTextContent("Annuler");
  },
};

export const ContrastViolation: Story = {
  render: () => <p style={{ color: "#fff3e0", background: "#fff7ec" }}>Texte presque invisible</p>,
};
