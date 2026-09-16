import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { ContactLink } from "./ContactLink";

test("an e-mail renders as a link whose accessible name is the address itself", () => {
  render(<ContactLink kind="email" value="jeanne@example.ch" />);

  // Add an aria-label and this fails, which is the point: the accessible name
  // must stay the visible address (WCAG 2.5.3, and speech input).
  expect(screen.getByRole("link", { name: "jeanne@example.ch" })).toHaveAttribute(
    "href",
    "mailto:jeanne@example.ch",
  );
});

test("a phone shows what was stored and dials what was sanitised", () => {
  render(<ContactLink kind="phone" value="079 123 45 67" />);

  // Both halves of the contract in one assertion: displayed verbatim, linked
  // sanitised.
  expect(screen.getByRole("link", { name: "079 123 45 67" })).toHaveAttribute(
    "href",
    "tel:0791234567",
  );
});

test("a value that cannot be linked is still shown, as text", () => {
  render(<ContactLink kind="phone" value="à demander" />);

  // The presence half is what makes this honest -- the absence half alone
  // passes against a component that renders nothing at all.
  expect(screen.getByText("à demander")).toBeInTheDocument();
  expect(screen.queryByRole("link")).toBeNull();
});

test("a caller's classes reach the link without taking the touch target away", () => {
  render(<ContactLink kind="email" value="jeanne@example.ch" className="text-sm" />);

  const link = screen.getByRole("link");
  expect(link).toHaveClass("text-sm");
  // min-h-8 is only real because of inline-flex; both must survive the merge.
  expect(link).toHaveClass("min-h-8");
  expect(link).toHaveClass("inline-flex");
});

test("unlinked text does not claim a touch target", () => {
  render(<ContactLink kind="phone" value="à demander" className="text-sm" />);

  const text = screen.getByText("à demander");
  expect(text).toHaveClass("text-sm");
  // 2.5.8 is a requirement on a pointer target. Static text is not one.
  expect(text).not.toHaveClass("min-h-8");
});

test("an empty value renders nothing rather than an empty line", () => {
  const { container } = render(<ContactLink kind="phone" value="   " />);

  expect(container).toBeEmptyDOMElement();
});
