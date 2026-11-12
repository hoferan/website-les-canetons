import { render, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Input } from "../../primitives";
import { FormField } from "./form-field";

function Field(props: Partial<React.ComponentProps<typeof FormField>>) {
  return (
    <FormField id="name" label="Nom" {...props}>
      {(control) => <Input {...control} />}
    </FormField>
  );
}

describe("FormField", () => {
  test("labels the control, which is reachable by that label", () => {
    render(<Field />);
    expect(screen.getByLabelText("Nom")).toBe(screen.getByRole("textbox"));
  });

  test("a clean field is not invalid and has no description", () => {
    render(<Field />);
    const input = screen.getByRole("textbox");
    expect(input).not.toHaveAttribute("aria-invalid");
    expect(input).not.toHaveAttribute("aria-describedby");
    expect(input).not.toBeRequired();
  });

  test("required puts the star beside the label and not in its name", () => {
    render(<Field required />);
    expect(screen.getByRole("textbox", { name: "Nom" })).toBeRequired();
    const star = screen.getByText("*");
    expect(star).toHaveAttribute("aria-hidden", "true");
    expect(screen.getByText("Nom", { selector: "label" })).not.toContainElement(star);
  });

  test("the error is linked, marks the control invalid, and is described after the hint", () => {
    render(<Field hint="Comme sur la carte." error="Nom est obligatoire" describedBy="rule" />);
    const input = screen.getByRole("textbox");
    expect(input).toBeInvalid();
    expect(input).toHaveAttribute("aria-describedby", "rule name-hint name-error");
    expect(input).toHaveAccessibleDescription(/Comme sur la carte\.\s*Nom est obligatoire/);
    expect(screen.getByText("Nom est obligatoire")).toHaveAttribute("id", "name-error");
  });

  test("invalid marks the control without an error of its own", () => {
    render(<Field invalid />);
    expect(screen.getByRole("textbox")).toBeInvalid();
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-describedby");
  });

  test("a badge is part of the accessible name", () => {
    render(<Field badge={<span>(FR)</span>} />);
    expect(screen.getByRole("textbox", { name: "Nom (FR)" })).toBeInTheDocument();
  });

  test("every state has no structural accessibility violations", async () => {
    const { container } = render(
      <div>
        <FormField id="a" label="Prénom">
          {(control) => <Input {...control} />}
        </FormField>
        <FormField id="b" label="Courriel" required hint="Une adresse valide." error="Invalide">
          {(control) => <Input {...control} type="email" />}
        </FormField>
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
