import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";

import { Button } from "../../primitives";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

/**
 * A dialog that closes on Escape and on a click outside, such as the photo
 * picker. Every dialog in the app is opened from state, with no Trigger, and
 * focus goes back to what opened it. The caller places its own close control.
 */
function PhotoPicker({ overlay = true }: { overlay?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Choisir une photo
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent overlay={overlay}>
          <DialogHeader>
            <DialogTitle>Choisir une photo</DialogTitle>
            <DialogDescription>Les photos de la bibliothèque.</DialogDescription>
          </DialogHeader>
          <p>La grille des photos vient ici.</p>
          <DialogFooter>
            <Button size="lg" onClick={() => setOpen(false)}>
              Utiliser cette photo
            </Button>
            <DialogClose asChild>
              <Button size="lg" variant="secondary">
                Annuler
              </Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

const meta = {
  title: "Composites/Dialog",
  component: PhotoPicker,
} satisfies Meta<typeof PhotoPicker>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Modal: Story = {};

/** Non-modal, leaving the page in view, as the block editor's panel does. */
export const WithoutOverlay: Story = { args: { overlay: false } };

export const OpensAndGivesFocusBack: Story = {
  play: async ({ canvas, canvasElement }) => {
    const opener = canvas.getByRole("button", { name: "Choisir une photo" });
    await userEvent.click(opener);
    // The dialog is portalled out of the story's root.
    const page = within(canvasElement.ownerDocument.body);
    await expect(await page.findByRole("dialog", { name: "Choisir une photo" })).toBeVisible();

    await userEvent.keyboard("{Escape}");
    await expect(page.queryByRole("dialog")).toBeNull();
    await expect(opener).toHaveFocus();
  },
};
