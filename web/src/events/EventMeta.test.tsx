import { render, screen } from "@testing-library/react";
import { afterEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import { EventMeta } from "./EventMeta";

afterEach(async () => {
  await setLocale("fr");
});

test("renders nothing when it is given nothing", () => {
  const { container } = render(<EventMeta />);
  expect(container).toBeEmptyDOMElement();
});

test("shows the public chip only for a public event", () => {
  const { rerender } = render(<EventMeta isPublic />);
  expect(screen.getByText("Public")).toBeInTheDocument();

  // Absence, not a "Privé" chip: within an audience that all holds
  // events.manage, absence is unambiguous, and the planning is mostly
  // rehearsals.
  rerender(<EventMeta isPublic={false} />);
  expect(screen.queryByText("Public")).toBeNull();
});

test("reads the fraction out loud as words", () => {
  // "12/18" is announced as a date or a fraction by a screen reader, neither
  // of which is what it says.
  render(<EventMeta answered={12} answerable={18} />);
  expect(screen.getByText("12/18 réponses")).toBeInTheDocument();
  expect(screen.getByLabelText("12 réponses sur 18")).toBeInTheDocument();
});

test("shows the zero fraction rather than hiding it", () => {
  // On the planning, 0/18 IS the chase cue.
  render(<EventMeta answered={0} answerable={18} />);
  expect(screen.getByText("0/18 réponses")).toBeInTheDocument();
  expect(screen.getByLabelText("0 réponse sur 18")).toBeInTheDocument();
});

test("pluralises the head count and names the empty case", () => {
  const { rerender } = render(<EventMeta guests={6} />);
  expect(screen.getByText("6 personnes")).toBeInTheDocument();

  rerender(<EventMeta guests={1} />);
  expect(screen.getByText("1 personne")).toBeInTheDocument();

  // "0 personne" is not French.
  rerender(<EventMeta guests={0} />);
  expect(screen.getByText("Aucune inscription")).toBeInTheDocument();
});

test("ZERO IS SINGULAR IN FRENCH AND PLURAL IN GERMAN, which no ternary can do", async () => {
  // THE TEST THIS WHOLE SLICE IS FOR. The aria-label was built in the
  // component as `answered === 0 || answered === 1 ? "réponse" : "réponses"`,
  // which is the French CLDR rule written out in JavaScript. The French
  // assertion for it is four tests above this one and is UNCHANGED — it still
  // reads "0 réponse sur 18".
  //
  // German counts zero as plural. So that ternary rendered "0 Rückmeldung",
  // and the obvious repair — `=== 1` — would have rendered "0 réponses".
  // There is no single expression in the component that is right in both
  // languages, which is why the rule now lives in the catalogue and i18next
  // picks the form from the ACTIVE language.
  //
  // MUTATION TEST: collapse events.meta.answersAria_one and _other into one
  // key and this fails on one of the two locales, whichever form is kept.
  await setLocale("de-CH");

  const { rerender } = render(<EventMeta answered={0} answerable={18} />);
  expect(screen.getByLabelText("0 Rückmeldungen von 18")).toBeInTheDocument();

  rerender(<EventMeta answered={1} answerable={18} />);
  expect(screen.getByLabelText("1 Rückmeldung von 18")).toBeInTheDocument();

  rerender(<EventMeta answered={12} answerable={18} />);
  expect(screen.getByLabelText("12 Rückmeldungen von 18")).toBeInTheDocument();
  expect(screen.getByText("12/18 Rückmeldungen")).toBeInTheDocument();
});

test("the head count and the empty case are German too", async () => {
  await setLocale("de-CH");

  const { rerender } = render(<EventMeta guests={6} />);
  expect(screen.getByText("6 Personen")).toBeInTheDocument();

  rerender(<EventMeta guests={1} />);
  expect(screen.getByText("1 Person")).toBeInTheDocument();

  // Its own key, not a plural form: neither language has a `_zero` category,
  // and "Keine Anmeldungen" is not the singular of anything.
  rerender(<EventMeta guests={0} />);
  expect(screen.getByText("Keine Anmeldungen")).toBeInTheDocument();
});

test("the public chip is German", async () => {
  await setLocale("de-CH");
  render(<EventMeta isPublic />);
  expect(screen.getByText("Öffentlich")).toBeInTheDocument();
});
