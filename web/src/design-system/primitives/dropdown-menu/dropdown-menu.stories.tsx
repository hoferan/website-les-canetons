import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, Trash2 } from "lucide-react";
import { expect, userEvent, within } from "storybook/test";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./dropdown-menu";

const meta = {
  title: "Primitives/DropdownMenu",
  component: DropdownMenu,
} satisfies Meta<typeof DropdownMenu>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Not modal: the page stays reachable, scroll is not locked and focus is not trapped. */
export const Default: Story = {
  render: () => (
    <DropdownMenu>
      <DropdownMenuTrigger className="rounded-button border-3 border-ink bg-white px-3 py-2 font-bold">
        Plus d’actions
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <DropdownMenuItem>
          <Copy aria-hidden="true" />
          Dupliquer la carte
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem destructive>
          <Trash2 aria-hidden="true" />
          Supprimer la carte
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ),
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    const body = within(canvasElement.ownerDocument.body);
    await expect(await body.findByRole("menu")).toBeInTheDocument();
  },
};
