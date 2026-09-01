import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { StatTile } from "./StatTile";

test("it shows the number and its label", () => {
  render(<StatTile label="Convoqués" value={5} />);
  expect(screen.getByText("5")).toBeInTheDocument();
  expect(screen.getByText("Convoqués")).toBeInTheDocument();
});

// The admin summary renders these in a named <ul>, so the tile has to be a
// list item there. A <div> inside a <ul> is invalid markup and breaks the
// listitem role query the page's own test relies on.
test("it renders as a list item so it can sit in the summary list", () => {
  render(
    <ul>
      <StatTile label="Participe" value={3} />
    </ul>,
  );
  expect(screen.getByRole("listitem")).toHaveTextContent("Participe");
});

test("it keeps the data-tile hook the admin page's test uses", () => {
  const { container } = render(
    <ul>
      <StatTile label="Participe" value={3} />
    </ul>,
  );
  expect(container.querySelector("[data-tile]")).not.toBeNull();
});
