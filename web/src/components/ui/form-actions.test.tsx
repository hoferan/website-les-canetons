import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Button } from "./button";
import { FormActions } from "./form-actions";

test("stacks full width on a phone and rows from sm", () => {
  render(
    <FormActions data-testid="footer">
      <Button>Enregistrer</Button>
    </FormActions>,
  );
  const footer = screen.getByTestId("footer");
  expect(footer).toHaveAttribute("data-slot", "form-actions");
  for (const name of ["flex-col", "items-stretch", "sm:flex-row"]) {
    expect(footer).toHaveClass(name);
  }
});

test("pushes a quiet action to the end", () => {
  render(<FormActions data-testid="footer" />);
  expect(screen.getByTestId("footer")).toHaveClass("sm:[&>[data-variant=quiet]]:ml-auto");
});

test("keeps the caller's order", () => {
  render(
    <FormActions>
      <Button>Enregistrer</Button>
      <Button variant="secondary">Annuler</Button>
      <Button variant="quiet">Rétablir</Button>
    </FormActions>,
  );
  const names = screen.getAllByRole("button").map((button) => button.textContent);
  expect(names).toEqual(["Enregistrer", "Annuler", "Rétablir"]);
});
