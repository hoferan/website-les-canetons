import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { EventMeta } from "./EventMeta";

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
