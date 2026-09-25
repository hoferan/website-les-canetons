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
 * FOCUS GOES BACK TO WHAT OPENED THE DIALOG (#104's review). Radix returns it
 * to an AlertDialogTrigger, and no dialog in the app has one: each is opened
 * from state, so on closing focus fell to <body> and a keyboard user started
 * again from the top of the page.
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
