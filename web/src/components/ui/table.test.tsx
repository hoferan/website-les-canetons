import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { Table, TableHead, TableHeader, TableRow } from "./table";

function renderHeader(children: React.ReactNode) {
  return render(
    <Table>
      <TableHeader>
        <TableRow>{children}</TableRow>
      </TableHeader>
    </Table>,
  );
}

// `scope` is what TableHead owns, so it is asserted here rather than on each
// page that renders a table -- the PageSection.test.tsx rule.
test("a header cell declares itself a column header", () => {
  renderHeader(
    <>
      <TableHead>Nom</TableHead>
      <TableHead>Contact</TableHead>
    </>,
  );

  const heads = screen.getAllByRole("columnheader");

  // Without this the loop passes vacuously on an empty list.
  expect(heads).toHaveLength(2);

  for (const head of heads) {
    expect(head).toHaveAttribute("scope", "col");
  }
});

test("a caller can override the scope", () => {
  // This pins that scope="col" is written BEFORE {...props} in the JSX. Put it
  // after and the caller's value is dropped and this test goes red, which is
  // the whole reason the test exists.
  renderHeader(<TableHead scope="row">Nom</TableHead>);

  expect(screen.getByRole("rowheader")).toHaveAttribute("scope", "row");
});
