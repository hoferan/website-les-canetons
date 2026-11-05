import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./dialog";

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Choisir
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Photos</DialogTitle>
            <DialogDescription>La bibliothèque.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <button type="button">Enregistrer</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

test("Escape closes the dialog and focus returns to what opened it", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByRole("button", { name: "Choisir" });
  await user.click(opener);
  expect(await screen.findByRole("dialog", { name: "Photos" })).toBeInTheDocument();

  await user.keyboard("{Escape}");
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(opener).toHaveFocus();
});

test("the footer is a form-actions row", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByRole("button", { name: "Choisir" }));
  const save = await screen.findByRole("button", { name: "Enregistrer" });
  expect(save.parentElement).toHaveAttribute("data-slot", "form-actions");
});
