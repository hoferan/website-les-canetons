import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, test } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Input } from "../input";
import { Textarea } from "./textarea";

describe("Textarea", () => {
  test("is a multi-line textbox that forwards ref, className and native attributes", () => {
    const ref = createRef<HTMLTextAreaElement>();
    render(<Textarea ref={ref} aria-label="Message" className="pr-12" rows={6} maxLength={1000} />);
    const textarea = screen.getByRole("textbox", { name: "Message" });
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(ref.current).toBe(textarea);
    expect(textarea).toHaveClass("pr-12");
    expect(textarea).toHaveAttribute("rows", "6");
    expect(textarea).toHaveAttribute("maxlength", "1000");
    expect(textarea).toHaveAttribute("data-slot", "textarea");
  });

  test("takes typing, line breaks included", async () => {
    const user = userEvent.setup();
    render(<Textarea aria-label="Message" />);
    await user.type(screen.getByRole("textbox"), "Bonjour,{Enter}Merci");
    expect(screen.getByRole("textbox")).toHaveValue("Bonjour,\nMerci");
  });

  // jsdom has no layout, so this pins the classes; the stories show the result.
  test("wears Input's radius, border, ground, focus ring and invalid border", () => {
    render(
      <>
        <Input aria-label="Nom" />
        <Textarea aria-label="Message" />
      </>,
    );
    const shared = [
      "rounded-control",
      "border-input",
      "bg-transparent",
      "focus-ring",
      "aria-invalid:border-feedback-error",
    ];
    expect(screen.getByRole("textbox", { name: "Nom" })).toHaveClass(...shared);
    expect(screen.getByRole("textbox", { name: "Message" })).toHaveClass(...shared);
  });

  test("keeps 16 px text at every width and no shadow, as the contact form's box had", () => {
    render(<Textarea aria-label="Message" />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("text-base", "py-2");
    expect(textarea.className).not.toMatch(/md:text-sm|shadow-xs/);
  });

  test("a caller's class wins over the primitive's", () => {
    render(<Textarea aria-label="Message" className="min-h-40 py-3" />);
    const textarea = screen.getByRole("textbox");
    expect(textarea).toHaveClass("py-3", "min-h-40");
    expect(textarea).not.toHaveClass("py-2");
  });

  test("is styled as invalid only when told so", () => {
    const { rerender } = render(<Textarea aria-label="Message" />);
    expect(screen.getByRole("textbox")).not.toHaveAttribute("aria-invalid");
    rerender(<Textarea aria-label="Message" aria-invalid />);
    expect(screen.getByRole("textbox")).toBeInvalid();
  });

  test("a labelled textarea has no structural accessibility violations", async () => {
    const { container } = render(
      <div>
        <label htmlFor="m">Message</label>
        <Textarea id="m" />
        <Textarea aria-label="Remarque" aria-invalid disabled />
      </div>,
    );
    await expectNoA11yViolations(container);
  });
});
