import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Notice } from "./Notice";

test("renders what it was given", () => {
  render(<Notice>Le comité est joignable directement.</Notice>);

  expect(screen.getByText("Le comité est joignable directement.")).toBeInTheDocument();
});

/**
 * A notice is not an error and must not be a live region, which would
 * interrupt a screen-reader user for a paragraph already on the page.
 */
test("is not an alert and not a live region", () => {
  render(<Notice>Ce formulaire est destiné aux visiteurs du site.</Notice>);

  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

test("takes a caller's spacing without losing its own look", () => {
  render(<Notice className="mt-block">Une note.</Notice>);

  const notice = screen.getByText("Une note.");
  expect(notice).toHaveClass("mt-block");
  expect(notice).toHaveClass("bg-accent");
});
