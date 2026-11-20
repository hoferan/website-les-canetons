import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "../../primitives";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";

/**
 * A question that must be answered: no click outside closes it, Escape is
 * Cancel. The action comes first, then Cancel; both are `lg` by default.
 * Opened from state, and focus goes back to what opened it.
 */
function ConfirmDelete({ danger = true }: { danger?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Supprimer le rôle
      </Button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le rôle « Caisse » ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les membres qui l’ont le perdent. Cela ne peut pas être annulé.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction variant={danger ? "danger" : "primary"}>
              {danger ? "Supprimer" : "Continuer"}
            </AlertDialogAction>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

const meta = {
  title: "Composites/AlertDialog",
  component: ConfirmDelete,
} satisfies Meta<typeof ConfirmDelete>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Danger: Story = {};

export const Primary: Story = { args: { danger: false } };

export const CancelGivesFocusBack: Story = {
  play: async ({ canvas, canvasElement }) => {
    const opener = canvas.getByRole("button", { name: "Supprimer le rôle" });
    await userEvent.click(opener);
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("alertdialog")).toBeVisible();

    await userEvent.click(page.getByRole("button", { name: "Annuler" }));
    await expect(page.queryByRole("alertdialog")).toBeNull();
    await expect(opener).toHaveFocus();
  },
};
