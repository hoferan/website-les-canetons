import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";

import { FormError, FormField } from "./FormField";

const noop = () => {};

test("renders a labelled input wired to its own id", () => {
  render(
    <FormField
      id="demo-name"
      label="Nom :"
      value="Canard"
      onChange={noop}
      type="password"
      required
      autoComplete="username"
    />,
  );
  const input = screen.getByLabelText("Nom :");
  expect(input).toHaveValue("Canard");
  expect(input).toHaveAttribute("id", "demo-name");
  expect(input).toBeRequired();
  expect(input).toHaveAttribute("type", "password");
  expect(input).toHaveAttribute("autocomplete", "username");
});

test("renders a textarea when asked for one", () => {
  render(
    <FormField id="demo-message" label="Message :" as="textarea" value="Coin" onChange={noop} />,
  );
  expect(screen.getByLabelText("Message :").tagName).toBe("TEXTAREA");
});

// The whole reason this component exists: three attributes that must agree,
// copy-pasted per input, and silently useless if the ids drift apart.
test("a problem marks the control invalid and points it at the message", () => {
  render(
    <FormField id="demo-name" label="Nom :" value="" onChange={noop} problem="Nom est requis" />,
  );
  const input = screen.getByLabelText("Nom :");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("aria-describedby", "demo-name-error");
  expect(screen.getByText("Nom est requis")).toHaveAttribute("id", "demo-name-error");
});

test("no problem means no aria-invalid and no message", () => {
  render(<FormField id="demo-name" label="Nom :" value="" onChange={noop} />);
  const input = screen.getByLabelText("Nom :");
  expect(input).not.toHaveAttribute("aria-invalid");
  expect(input).not.toHaveAttribute("aria-describedby");
});

test("onChange receives the value, not the event", async () => {
  const user = userEvent.setup();
  const seen: string[] = [];
  render(<FormField id="demo-name" label="Nom :" value="" onChange={(v) => seen.push(v)} />);
  await user.type(screen.getByLabelText("Nom :"), "ab");
  expect(seen).toEqual(["a", "b"]);
});

// The whole point of FormError: the live region is resident, so an error that
// appears later is a CONTENT change inside an existing alert rather than a
// freshly-inserted one. Rendering it conditionally again would pass every form
// test in the suite and silently undo the fix, so it is pinned here.
test("the error region is in the tree even with no error", () => {
  render(<FormError error={null} />);
  expect(screen.getByRole("alert")).toBeEmptyDOMElement();
});

test("an error fills the same region rather than adding one", () => {
  const { rerender } = render(<FormError error={null} />);
  const region = screen.getByRole("alert");
  rerender(<FormError error={{ message: "Le formulaire contient des erreurs.", fields: [] }} />);
  expect(screen.getByRole("alert")).toBe(region);
  expect(region).toHaveTextContent("Le formulaire contient des erreurs.");
});
