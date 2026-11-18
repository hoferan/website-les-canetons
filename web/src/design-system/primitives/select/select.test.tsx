import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, test } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Input } from "../input";
import { Select } from "./select";

const registers = (
  <>
    <option value="">Aucun</option>
    <option value="1">Cloches</option>
    <option value="2">Trompettes</option>
  </>
);

describe("Select", () => {
  test("is a native combobox that forwards ref, className and native attributes", () => {
    const ref = createRef<HTMLSelectElement>();
    render(
      <Select ref={ref} aria-label="Pupitre" className="max-w-60" name="sectionId">
        {registers}
      </Select>,
    );
    const select = screen.getByRole("combobox", { name: "Pupitre" });
    expect(select.tagName).toBe("SELECT");
    expect(ref.current).toBe(select);
    expect(select).toHaveClass("max-w-60");
    expect(select).toHaveAttribute("name", "sectionId");
    expect(select).toHaveAttribute("data-slot", "select");
  });

  test("takes a choice", async () => {
    const user = userEvent.setup();
    render(<Select aria-label="Pupitre">{registers}</Select>);
    await user.selectOptions(screen.getByRole("combobox"), "Trompettes");
    expect(screen.getByRole("combobox")).toHaveValue("2");
  });

  // jsdom has no layout, so this pins the classes; the stories show the result.
  test("wears Input's floor, radius, border and focus ring", () => {
    render(
      <>
        <Input aria-label="Nom" />
        <Select aria-label="Pupitre">{registers}</Select>
      </>,
    );
    const shared = [
      "min-h-touch",
      "rounded-control",
      "border-input",
      "bg-transparent",
      "md:text-sm",
      "focus-ring",
      "aria-invalid:border-feedback-error",
    ];
    expect(screen.getByRole("textbox")).toHaveClass(...shared);
    expect(screen.getByRole("combobox")).toHaveClass(...shared);
  });

  test("draws its own chevron, hidden from assistive technology", () => {
    render(<Select aria-label="Pupitre">{registers}</Select>);
    const select = screen.getByRole("combobox");
    expect(select).toHaveClass("appearance-none", "pr-9");
    const chevron = select.parentElement?.querySelector("svg");
    expect(chevron).toHaveAttribute("aria-hidden", "true");
  });

  test("is styled as invalid only when told so", () => {
    const { rerender } = render(<Select aria-label="Pupitre">{registers}</Select>);
    expect(screen.getByRole("combobox")).not.toHaveAttribute("aria-invalid");
    rerender(
      <Select aria-label="Pupitre" aria-invalid>
        {registers}
      </Select>,
    );
    expect(screen.getByRole("combobox")).toHaveAttribute("aria-invalid", "true");
  });

  test("a labelled select has no structural accessibility violations", async () => {
    const { container } = render(
      <div>
        <label htmlFor="s">Pupitre</label>
        <Select id="s">{registers}</Select>
        <Select aria-label="Fonction" aria-invalid disabled>
          {registers}
        </Select>
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
