import { useState } from "react";

import type { Config200OccasionMenusItem } from "../api/generated/model";

/**
 * One row per guest — "Personne N", a menu, and a way to remove them.
 *
 * PORTED, not redesigned. A per-menu quantity stepper would produce an
 * identical payload (the API only ever counts `menus[]`; order is never read)
 * and would be fewer clicks for a table of eight. It was rejected because this
 * is a page returning visitors have used, and because one-row-per-person is how
 * a family actually fills the form in.
 *
 * CONTROLLED: the page owns `menus`, so a failed submission does not lose the
 * guest list. Two things the old signup.js lacked are added — the cap is
 * enforced before submit, and the running total is shown.
 */
export function GuestMenus({
  menus,
  onChange,
  options,
  maxGuests,
}: {
  menus: string[];
  onChange: (menus: string[]) => void;
  options: Config200OccasionMenusItem[];
  maxGuests: number;
}) {
  const [capped, setCapped] = useState(false);

  const add = () => {
    if (menus.length >= maxGuests) {
      // The old form let you add a 31st row, made the round trip, and surfaced
      // the rejection as an alert that named no cause. Say it here instead.
      setCapped(true);
      return;
    }
    setCapped(false);
    onChange([...menus, options[0]?.value ?? ""]);
  };

  const removeAt = (index: number) => {
    setCapped(false);
    onChange(menus.filter((_, position) => position !== index));
  };

  const setAt = (index: number, value: string) => {
    onChange(menus.map((menu, position) => (position === index ? value : menu)));
  };

  const counts = options.map((option) => ({
    label: option.label,
    total: menus.filter((menu) => menu === option.value).length,
  }));

  return (
    <div>
      {/* NAMED, because the layout's nav is a list too and an unscoped
          getByRole("listitem") counts nav items. */}
      <ul aria-label="Personnes" className="space-y-2">
        {menus.map((menu, index) => {
          const id = `guest-${index}`;
          return (
            /* Keyed by index deliberately: a guest has no identity beyond their
               position, and the label IS the position. The <select> is
               controlled, so a removal re-renders every later row's value from
               `menus` rather than leaving stale DOM behind. */
            <li key={index} className="flex items-center gap-3">
              <label htmlFor={id} className="w-28 shrink-0 text-ink-muted">
                Personne {index + 1}
              </label>
              <select
                id={id}
                value={menu}
                onChange={(event) => setAt(index, event.target.value)}
                className="flex-1 rounded border border-line bg-panel px-3 py-2 text-ink outline-none focus:border-violet focus:ring-2 focus:ring-violet/30"
              >
                {options.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              {/* Never offered for the only remaining row: `menus` may not be
                  empty, and the server rejects an empty list with a message
                  about a format, which explains nothing to a visitor. */}
              {menus.length > 1 ? (
                <button
                  type="button"
                  aria-label="Retirer cette personne"
                  onClick={() => removeAt(index)}
                  className="rounded px-2 py-1 text-ink-muted hover:bg-line hover:text-danger"
                >
                  ✕
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <button
        type="button"
        onClick={add}
        className="mt-3 rounded border border-line px-3 py-2 hover:border-violet hover:text-violet"
      >
        ＋ Ajouter une personne
      </button>

      {capped ? (
        <p role="alert" className="mt-2 text-danger">
          {maxGuests} personnes au maximum par inscription. Faites une seconde inscription pour le
          reste de votre groupe.
        </p>
      ) : null}

      <p data-testid="guest-total" aria-live="polite" className="mt-3 text-sm text-ink-muted">
        {menus.length} {menus.length > 1 ? "personnes" : "personne"} ·{" "}
        {counts.map((count) => `${count.total} ${count.label}`).join(", ")}
      </p>
    </div>
  );
}
