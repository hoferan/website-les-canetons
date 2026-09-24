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

// #101: a committee-issued password is read down a phone and typed into a
// phone, which is exactly where a field you cannot see costs the most.
test("a password field can be revealed and hidden again", async () => {
  const user = userEvent.setup();
  render(<FormField id="demo-pw" label="Mot de passe" type="password" value="x" onChange={noop} />);
  const input = screen.getByLabelText("Mot de passe");
  const toggle = screen.getByRole("button", { name: "Afficher le mot de passe" });
  expect(toggle).toHaveAttribute("aria-pressed", "false");
  expect(toggle).toHaveAttribute("aria-controls", "demo-pw");

  await user.click(toggle);
  expect(input).toHaveAttribute("type", "text");
  expect(toggle).toHaveAttribute("aria-pressed", "true");

  await user.click(toggle);
  expect(input).toHaveAttribute("type", "password");
});

test("the reveal button never submits the form it sits in", async () => {
  const user = userEvent.setup();
  let submitted = false;
  render(
    <form onSubmit={(event) => ((submitted = true), event.preventDefault())}>
      <FormField id="demo-pw" label="Mot de passe" type="password" value="x" onChange={noop} />
    </form>,
  );
  await user.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
  expect(submitted).toBe(false);
});

test("only a password field gets a reveal button", () => {
  render(<FormField id="demo-name" label="Nom :" value="" onChange={noop} />);
  expect(screen.queryByRole("button")).toBeNull();
});

// The page clears every password after a submit, success or failure, so going
// back to hidden when emptied is what stops a new password sitting on screen.
test("an emptied password field goes back to hidden", async () => {
  const user = userEvent.setup();
  const { rerender } = render(
    <FormField id="demo-pw" label="Mot de passe" type="password" value="x" onChange={noop} />,
  );
  await user.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
  rerender(
    <FormField id="demo-pw" label="Mot de passe" type="password" value="" onChange={noop} />,
  );
  expect(screen.getByLabelText("Mot de passe")).toHaveAttribute("type", "password");
  expect(screen.getByRole("button", { name: "Afficher le mot de passe" })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
});

test("a hint is announced with the field, before any problem", () => {
  render(
    <FormField
      id="demo-pw"
      label="Mot de passe"
      value=""
      onChange={noop}
      hint="Au moins 8 caractères"
      problem="Trop court"
    />,
  );
  const input = screen.getByLabelText("Mot de passe");
  expect(input).toHaveAttribute("aria-describedby", "demo-pw-hint demo-pw-error");
  expect(screen.getByText("Au moins 8 caractères")).toHaveAttribute("id", "demo-pw-hint");
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
