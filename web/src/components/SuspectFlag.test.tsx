// The matchers fold the no-break space before a French colon into a plain
// space, so the expected strings use a plain one.
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { SuspectBadge, SuspectReasons } from "./SuspectFlag";

test("a clean row shows neither the badge nor a reason", () => {
  const { container } = render(
    <>
      <SuspectBadge kind="booking" flagged={false} />
      <SuspectReasons fields={[]} />
    </>,
  );

  expect(container).toBeEmptyDOMElement();
});

test("names the flagged fields in the reader's words", () => {
  render(<SuspectReasons fields={["firstName", "tableName", "answers"]} />);

  expect(screen.getByText("Lien ou balise dans : prénom, table, réponses.")).toBeInTheDocument();
});

test("says the confirmation is held when asked to", () => {
  render(<SuspectReasons fields={["tableName"]} mailHeld />);

  expect(screen.getByTestId("suspect-reasons")).toHaveTextContent(
    "Lien ou balise dans : table. Confirmation pas encore envoyée.",
  );
});

test("agrees with what it flags", () => {
  render(
    <>
      <SuspectBadge kind="booking" flagged />
      <SuspectBadge kind="message" flagged />
    </>,
  );

  expect(screen.getByText("Suspecte")).toBeInTheDocument();
  expect(screen.getByText("Suspect")).toBeInTheDocument();
});

test("shows an unknown field token as it came rather than dropping it", () => {
  render(<SuspectReasons fields={["website"]} />);

  expect(screen.getByText("Lien ou balise dans : website.")).toBeInTheDocument();
});
