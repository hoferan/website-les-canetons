import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";

import { FormError, FormField, formIsValid } from "./FormField";

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

// The three attributes must agree, or the message is silently never read.
test("a problem marks the control invalid and points it at the message", () => {
  render(
    <FormField
      id="demo-name"
      label="Nom :"
      value=""
      onChange={noop}
      problem="Nom est obligatoire"
    />,
  );
  const input = screen.getByLabelText("Nom :");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("aria-describedby", "demo-name-error");
  expect(screen.getByText("Nom est obligatoire")).toHaveAttribute("id", "demo-name-error");
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

// #101: a committee-issued password is read out over the phone and typed into
// one, where a field you cannot see costs the most.
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

// The live region is resident, so a later error is a content change inside an
// existing alert. Rendering it conditionally would pass every other form test,
// so it is pinned here.
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

// #102. The star is beside the label, so the accessible name stays "Nom".
test("a required field carries a star that stays out of its name", () => {
  render(<FormField id="demo-name" label="Nom" value="" onChange={noop} required />);
  expect(screen.getByRole("textbox", { name: "Nom" })).toBeRequired();
  expect(screen.getByText("*")).toHaveAttribute("aria-hidden", "true");
});

test("an optional field carries no star", () => {
  render(<FormField id="demo-name" label="Nom" value="" onChange={noop} />);
  expect(screen.queryByText("*")).toBeNull();
});

/** A form that submits through formIsValid, the way every form in the app does. */
function Validated({ value, type, problem }: { value: string; type?: string; problem?: string }) {
  return (
    <form
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        formIsValid(event.currentTarget);
      }}
    >
      <FormField
        id="demo-field"
        label="E-mail"
        type={type}
        value={value}
        onChange={noop}
        problem={problem}
        required
      />
      <button type="submit">Envoyer</button>
    </form>
  );
}

// The message comes from the catalogue, composed like translateApiError
// composes a server refusal, never from the browser's own bubble.
test("an empty required field says so in French, and points the control at it", async () => {
  const user = userEvent.setup();
  render(<Validated value="" />);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));

  const input = screen.getByLabelText("E-mail");
  expect(screen.getByText("E-mail est obligatoire")).toHaveAttribute("id", "demo-field-error");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("aria-describedby", "demo-field-error");
  expect(input).toHaveFocus();
});

test("a malformed address is a format problem, not a missing one", async () => {
  const user = userEvent.setup();
  render(<Validated value="claire" type="email" />);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(screen.getByText("E-mail n'est pas dans un format valide")).toBeInTheDocument();
});

test("the message goes away as soon as the field is edited", async () => {
  const user = userEvent.setup();
  function Live() {
    const [value, setValue] = useState("");
    return (
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          formIsValid(event.currentTarget);
        }}
      >
        <FormField id="demo-field" label="Nom" value={value} onChange={setValue} required />
        <button type="submit">Envoyer</button>
      </form>
    );
  }
  render(<Live />);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(screen.getByText("Nom est obligatoire")).toBeInTheDocument();

  await user.type(screen.getByLabelText("Nom"), "R");
  expect(screen.queryByText("Nom est obligatoire")).toBeNull();
});

// The server knows things the browser cannot, "déjà utilisé" among them, so
// its answer is the one shown when there are both.
test("a server problem wins over the browser's", async () => {
  const user = userEvent.setup();
  render(<Validated value="" problem="E-mail est déjà utilisé" />);
  await user.click(screen.getByRole("button", { name: "Envoyer" }));
  expect(screen.getByText("E-mail est déjà utilisé")).toBeInTheDocument();
  expect(screen.queryByText("E-mail est obligatoire")).toBeNull();
});

test("formIsValid answers true, and focuses nothing, for a valid form", () => {
  render(<Validated value="claire@example.ch" type="email" />);
  const form = screen.getByRole("button", { name: "Envoyer" }).closest("form")!;
  expect(formIsValid(form)).toBe(true);
  expect(screen.getByLabelText("E-mail")).not.toHaveFocus();
});

/**
 * A description shared by several fields, such as a rule or an error about a
 * group of them, reaches each field through `describedBy`.
 */
test("describedBy, invalid and maxLength reach the control", () => {
  render(
    <>
      <p id="group-rule">Au moins un des deux.</p>
      <FormField
        id="demo-title"
        label="Titre"
        value=""
        onChange={noop}
        describedBy="group-rule"
        invalid
        maxLength={120}
      />
    </>,
  );
  const input = screen.getByLabelText("Titre");
  expect(input).toHaveAccessibleDescription("Au moins un des deux.");
  expect(input).toHaveAttribute("aria-invalid", "true");
  expect(input).toHaveAttribute("maxlength", "120");
});

test("invalid marks a textarea red, like an input", () => {
  render(<FormField id="demo-body" label="Texte" as="textarea" value="" onChange={noop} invalid />);
  expect(screen.getByLabelText("Texte")).toHaveClass("border-danger");
});
