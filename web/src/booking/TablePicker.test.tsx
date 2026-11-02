import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { beforeEach, expect, test } from "vitest";

import { setLocale } from "../i18n";
import type { TableChoice } from "./tables";
import { TablePicker } from "./TablePicker";

beforeEach(async () => {
  await setLocale("fr");
});

const TABLES: TableChoice[] = [
  { name: "Jakob", guests: 3 },
  { name: "Müller", guests: 10 },
];

/** The picker with its value held the way a form holds it; `sent` records every change. */
function Harness({
  tables = TABLES,
  seats = null,
  initial = "",
  sent = [],
}: {
  tables?: TableChoice[];
  seats?: number | null;
  initial?: string;
  sent?: string[];
}) {
  const [value, setValue] = useState(initial);
  return (
    <TablePicker
      id="table"
      tables={tables}
      seats={seats}
      value={value}
      onChange={(next) => {
        sent.push(next);
        setValue(next);
      }}
    />
  );
}

const optionTexts = () => screen.getAllByRole("option").map((option) => option.textContent);

test("lists the tables, none first and new last", () => {
  render(<Harness />);

  expect(optionTexts()).toEqual(["Pas de table", "Jakob", "Müller", "Nouvelle table…"]);
  expect(screen.getByLabelText("Table")).toHaveAccessibleDescription(
    "Choisissez la table que vous rejoignez. Si elle n’existe pas encore, créez-en une : le même nom, c’est la même table.",
  );
});

test("shows occupancy and full when seats are set", () => {
  render(<Harness seats={10} />);

  expect(optionTexts()).toEqual([
    "Pas de table",
    "Jakob (3/10)",
    "Müller (10/10, complet)",
    "Nouvelle table…",
  ]);
});

test("a full table stays selectable", async () => {
  const user = userEvent.setup();
  const sent: string[] = [];
  render(<Harness seats={10} sent={sent} />);

  const full = screen.getByRole("option", { name: "Müller (10/10, complet)" });
  expect(full).not.toBeDisabled();
  await user.selectOptions(screen.getByLabelText("Table"), full);

  expect(sent).toEqual(["Müller"]);
});

test("a table named like the new choice is still that table", async () => {
  const user = userEvent.setup();
  const sent: string[] = [];
  render(<Harness tables={[{ name: "new", guests: 2 }]} sent={sent} />);

  await user.selectOptions(
    screen.getByLabelText("Table"),
    screen.getByRole("option", { name: "new" }),
  );

  expect(sent).toEqual(["new"]);
  expect(screen.queryByLabelText("Nom de la nouvelle table")).not.toBeInTheDocument();
});

test("new reveals the name field, and an empty name means no table", async () => {
  const user = userEvent.setup();
  const sent: string[] = [];
  render(<Harness sent={sent} />);

  expect(screen.queryByLabelText("Nom de la nouvelle table")).not.toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText("Table"), "Nouvelle table…");

  const name = screen.getByLabelText("Nom de la nouvelle table");
  expect(name).toHaveFocus();
  expect(sent).toEqual([""]);

  await user.type(name, "Clerc");
  expect(sent.at(-1)).toBe("Clerc");
  // Still the new table, even while the name typed is the start of another one.
  expect(screen.getByLabelText("Table")).toHaveValue("new");
});

test("a name that is none of the tables opens as a new table with the name filled in", () => {
  render(<Harness initial="Clerc" />);

  expect(screen.getByLabelText("Table")).toHaveValue("new");
  expect(screen.getByLabelText("Nom de la nouvelle table")).toHaveValue("Clerc");
});

test("a name that is one of the tables opens on that table", () => {
  render(<Harness initial="Müller" />);

  expect(screen.getByLabelText("Table")).toHaveValue("t:Müller");
  expect(screen.queryByLabelText("Nom de la nouvelle table")).not.toBeInTheDocument();
});

test("a table that drops off the list after it was picked stays what the screen shows", async () => {
  // The form is read again after a refused submit, and the last booking at
  // the guest's table may have been cancelled meanwhile.
  const user = userEvent.setup();
  const sent: string[] = [];
  const { rerender } = render(<Harness sent={sent} />);
  await user.selectOptions(screen.getByLabelText("Table"), "Jakob");

  rerender(<Harness sent={sent} tables={[{ name: "Müller", guests: 10 }]} />);

  expect(screen.getByLabelText("Table")).toHaveDisplayValue("Jakob");
  expect(sent).toEqual(["Jakob"]);
});
