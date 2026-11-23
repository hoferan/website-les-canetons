import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";

import { expectNoA11yViolations } from "../../internal/testing/axe";
import { Notice } from "./notice";

const root = () => document.querySelector("[data-notice-level]");
const column = () => document.querySelector("[data-notice-column]");
const icon = () => document.querySelector("[data-level-icon]");

test("renders what it was given, as info by default", () => {
  render(<Notice>Le comité est joignable directement.</Notice>);

  expect(screen.getByText("Le comité est joignable directement.")).toBeInTheDocument();
  expect(root()).toHaveAttribute("data-notice-level", "info");
  expect(icon()).toHaveAttribute("data-level-icon", "info");
  expect(column()).toHaveClass("bg-cyan");
});

test.each([
  ["success", "bg-lime"],
  ["info", "bg-cyan"],
  ["warning", "bg-yellow"],
  ["error", "bg-danger"],
] as const)("a %s notice has its own icon in a %s column, like the toast", (level, fill) => {
  render(<Notice level={level}>Une note.</Notice>);

  expect(icon()).toHaveAttribute("data-level-icon", level);
  expect(icon()?.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  expect(column()).toHaveClass(fill);
});

/**
 * A notice is not an error and must not be a live region, which would
 * interrupt a screen-reader user for a paragraph already on the page. A
 * notice that answers an action sits in a live region its caller renders
 * beforehand. That holds at the error level too.
 */
test.each(["info", "error"] as const)(
  "a %s notice is not an alert and not a live region",
  (level) => {
    render(<Notice level={level}>Ce formulaire est destiné aux visiteurs du site.</Notice>);

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  },
);

test("flat in the page: no shadow, a light frame", () => {
  render(<Notice level="warning">Une note.</Notice>);

  expect(root()).toHaveClass("border-line");
  expect(root()?.className).not.toMatch(/shadow/);
});

test("has no close button unless the screen lets it be dismissed", () => {
  render(<Notice>Une note.</Notice>);

  expect(screen.queryByRole("button")).not.toBeInTheDocument();
});

test("closes through the caller when it can be dismissed", async () => {
  const onDismiss = vi.fn();
  render(
    <Notice level="success" dismiss={{ label: "Masquer", onDismiss }}>
      5 événements créés.
    </Notice>,
  );

  await userEvent.click(screen.getByRole("button", { name: "Masquer" }));

  expect(onDismiss).toHaveBeenCalledOnce();
});

test("takes a caller's spacing without losing its own look", () => {
  render(<Notice className="mt-block">Une note.</Notice>);

  expect(root()).toHaveClass("mt-block", "bg-panel");
});

test("has no accessibility violations at any level, dismissible or not", async () => {
  const { container } = render(
    <>
      <Notice level="success" dismiss={{ label: "Masquer", onDismiss: () => undefined }}>
        5 événements créés.
      </Notice>
      <Notice level="info">Une note.</Notice>
      <Notice level="warning">Ton mot de passe est provisoire.</Notice>
      <Notice level="error">Le téléchargement a été refusé.</Notice>
    </>,
  );

  await expectNoA11yViolations(container);
});
