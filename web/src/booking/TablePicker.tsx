import { useEffect, useRef, useState } from "react";

import { FormField } from "../components/FormField";
import { t } from "../i18n";
import type { TableChoice } from "./tables";

/** The option that reveals the name field. A table's own value is prefixed, so a table named "new" cannot collide with it. */
const NEW = "new";
const EXISTING = "t:";

/**
 * Which table a booking sits at: one of the event's tables, a new one, or none.
 *
 * A table is its name, so picking from the ones already booked is what keeps
 * "Müller" and "Tisch Müller" from becoming two tables on the committee's
 * plan. A name that is none of the listed tables opens as a new table with the
 * name filled in, which is how the committee's correction form shows a booking
 * alone at its table.
 *
 * With `seats`, each table says how full it is. A full table stays
 * selectable: the seats are information for the guest, not a limit.
 *
 * `value` is the booking's table name, "" for none; the field stays optional.
 */
export function TablePicker({
  id,
  tables,
  seats,
  value,
  onChange,
  problem,
}: {
  id: string;
  tables: TableChoice[];
  seats: number | null;
  value: string;
  onChange: (value: string) => void;
  problem?: string;
}) {
  const typed = value.trim();
  const [adding, setAdding] = useState(
    typed !== "" && !tables.some((table) => table.name === typed),
  );
  // Focus moves to the name field only when the guest chose a new table, not
  // when the picker opens on one.
  const [focusName, setFocusName] = useState(false);
  const nameField = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusName) {
      nameField.current?.querySelector("input")?.focus();
      setFocusName(false);
    }
  }, [focusName]);

  const selected = adding ? NEW : typed === "" ? "" : EXISTING + typed;
  // The form is read again after a refused submit, and the last booking at
  // the chosen table may have been cancelled meanwhile. The choice stays
  // listed, or the select would show "no table" while the booking keeps it.
  const listed =
    adding || typed === "" || tables.some((table) => table.name === typed)
      ? tables
      : [...tables, { name: typed, guests: 0 }];
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const selectProblem = adding ? undefined : problem;

  return (
    <div className="flex flex-col gap-related">
      <div className="flex flex-col gap-1">
        <label htmlFor={id}>{t("booking.fields.tableName")}</label>
        <select
          id={id}
          className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
          value={selected}
          aria-invalid={selectProblem ? true : undefined}
          aria-describedby={[hintId, selectProblem ? errorId : null].filter(Boolean).join(" ")}
          onChange={(event) => {
            const choice = event.target.value;
            if (choice === NEW) {
              setAdding(true);
              setFocusName(true);
              onChange("");
            } else {
              setAdding(false);
              onChange(choice === "" ? "" : choice.slice(EXISTING.length));
            }
          }}
        >
          <option value="">{t("booking.table.none")}</option>
          {listed.map((table) => (
            <option key={table.name} value={EXISTING + table.name}>
              {seats === null
                ? table.name
                : t(table.guests >= seats ? "booking.table.full" : "booking.table.occupancy", {
                    name: table.name,
                    guests: table.guests,
                    seats,
                  })}
            </option>
          ))}
          <option value={NEW}>{t("booking.table.new")}</option>
        </select>
        <div id={hintId} className="text-sm text-ink-muted">
          {t("booking.tableHint")}
        </div>
        {selectProblem ? (
          <span id={errorId} className="block text-sm text-danger">
            {selectProblem}
          </span>
        ) : null}
      </div>
      {adding ? (
        <div ref={nameField}>
          <FormField
            id={`${id}-new`}
            label={t("booking.table.newName")}
            value={value}
            onChange={onChange}
            problem={problem}
          />
        </div>
      ) : null}
    </div>
  );
}
