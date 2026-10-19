import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./alert-dialog";

/** A dialog opened from state, the way every dialog in the app is. */
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Supprimer
      </button>
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ?</AlertDialogTitle>
            <AlertDialogDescription>Pour de bon.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/**
 * Focus goes back to what opened the dialog. Radix returns it to an
 * AlertDialogTrigger, and no dialog in the app has one, so without the local
 * change focus would fall to <body>.
 */
test("closing a dialog opened from state gives focus back to what opened it", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "Supprimer" }));
  await user.click(await screen.findByRole("button", { name: "Annuler" }));

  expect(screen.getByRole("button", { name: "Supprimer" })).toHaveFocus();
});

test("Escape gives focus back too", async () => {
  const user = userEvent.setup();
  render(<Harness />);

  await user.click(screen.getByRole("button", { name: "Supprimer" }));
  await screen.findByRole("alertdialog");
  await user.keyboard("{Escape}");

  expect(screen.getByRole("button", { name: "Supprimer" })).toHaveFocus();
});
