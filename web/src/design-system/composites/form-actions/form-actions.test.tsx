import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Button } from "../../primitives";
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

test("never reverses the caller's order", () => {
  // DOM order is JSX order, so the real regression is a reverse class that
  // flips the visual order on a phone or in a row.
  render(
    <FormActions data-testid="footer">
      <Button>Enregistrer</Button>
      <Button variant="secondary">Annuler</Button>
    </FormActions>,
  );
  expect(screen.getByTestId("footer").className).not.toMatch(/-reverse/);
});

test("a footer of buttons has no axe violations", async () => {
  const { container } = render(
    <FormActions>
      <Button>Enregistrer</Button>
      <Button variant="secondary">Annuler</Button>
      <Button variant="quiet">Réinitialiser</Button>
    </FormActions>,
  );
  await expectNoA11yViolations(container);
});
