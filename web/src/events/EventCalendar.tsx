import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { EventResource } from "../api/generated/model";
import { currentLocale, t } from "../i18n";
import { intlTag } from "../i18n/locale";
import { bandZoneParts } from "./bandTime";

/**
 * THE THREE DISPLAY FORMATTERS, BUILT PER CALL AND CACHED BY SHAPE.
 *
 * All three were module-scope `new Intl.DateTimeFormat("fr-CH", …)` constants
 * — the anti-pattern #151 removed from web/src/lib/date.ts and did not reach
 * here. A module-scope formatter is bound to whatever locale was active when
 * the file was first imported, and no later locale change moves it, so the
 * German calendar rendered French month names.
 *
 * `WEEKDAYS` was the worst of the three and is the reason this is a function
 * rather than three swapped tags: it was a module-scope ARRAY of seven
 * already-formatted strings. Nothing about it could be fixed by making the
 * formatter locale-aware, because by the time any locale was chosen the
 * strings existed.
 *
 * KEYED BY SHAPE, NOT BY TAG. Two shapes can resolve to the same Intl tag —
 * both French kinds are `fr-CH` here — so a cache keyed on the tag alone
 * would hand the month formatter back when the day formatter was asked for.
 * Same bug the shape key in formatEventWhen.ts exists to prevent.
 *
 * ARITHMETIC STAYS IN UTC, and `bandTime`'s `en-US` parts extractor stays
 * fixed: it is a machine formatter, not a display one, and following the
 * active locale would break it silently.
 */
const cache = new Map<string, Intl.DateTimeFormat>();

const SHAPES: Record<"weekday" | "month" | "day", Intl.DateTimeFormatOptions> = {
  weekday: { weekday: "short", timeZone: "UTC" },
  month: { month: "long", year: "numeric", timeZone: "UTC" },
  day: { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
};

function formatter(shape: "weekday" | "month" | "day"): Intl.DateTimeFormat {
  const tag = intlTag(currentLocale(), "short");
  const key = `${tag}|${shape}`;

  let found = cache.get(key);
  if (!found) {
    found = new Intl.DateTimeFormat(tag, SHAPES[shape]);
    cache.set(key, found);
  }

  return found;
}

/** Monday first, the way a Swiss calendar is read. 1 January 2024 was a Monday. */
function weekdayNames(): string[] {
  const short = formatter("weekday");
  return Array.from({ length: 7 }, (_, index) =>
    short.format(new Date(Date.UTC(2024, 0, 1 + index))),
  );
}

/** "2026-09" for the month an ISO instant falls in, in Fribourg. */
function monthOf(iso: string): string {
  return bandZoneParts(iso).date.slice(0, 7);
}

/** The month before or after "2026-09", without going through a Date. */
function shiftMonth(month: string, by: number): string {
  const [year = 0, index = 1] = month.split("-").map(Number);
  const moved = new Date(Date.UTC(year, index - 1 + by, 1));
  return `${moved.getUTCFullYear()}-${String(moved.getUTCMonth() + 1).padStart(2, "0")}`;
}

/**
 * A month grid over the planning, for somebody looking at a season at a desk.
 *
 * NOT THE MAIN FEATURE, and the constraints say so. It is behind a flag that is
 * off on every server until it has been looked at on TEST, it is hidden below
 * `md` by the screen that mounts it, and clicking a day FILTERS THE LIST rather
 * than navigating — so the list stays the one way to do the primary job and
 * this stays an overview (design §6).
 *
 * HAND-ROLLED, with CSS grid and Intl.DateTimeFormat. The project has no
 * runtime dependency beyond two fonts; a calendar library would bring a
 * stylesheet to fight with the design tokens for the sake of a table of
 * numbers.
 *
 * ARITHMETIC IN UTC, display in Fribourg. The two are separate on purpose: a
 * month walked with local Dates crosses the October DST change and lands an
 * hour short, while the DAY an event belongs to has to be the Fribourg one —
 * an event at 00:30 here is the previous day in UTC, which is what
 * bandZoneParts exists to get right.
 *
 * A MULTI-DAY EVENT IS MARKED ON THE DAY IT STARTS, once. The musical weekend
 * runs Saturday to Sunday, and painting both days would say there are two
 * events when the planning below would show one.
 */
export function EventCalendar({
  events,
  selected,
  onSelect,
}: {
  events: EventResource[];
  /** The chosen day as "YYYY-MM-DD", or null when the whole list is shown. */
  selected: string | null;
  onSelect: (day: string | null) => void;
}) {
  const [month, setMonth] = useState(() => {
    const first = events[0];
    return first ? monthOf(first.startsAt) : monthOf(new Date().toISOString());
  });

  const counts = new Map<string, number>();
  for (const event of events) {
    const day = bandZoneParts(event.startsAt).date;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const [year = 0, index = 1] = month.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, index - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, index, 0)).getUTCDate();
  // getUTCDay() calls Sunday 0; the week here starts on Monday.
  const leading = (firstOfMonth.getUTCDay() + 6) % 7;

  return (
    <div data-testid="event-calendar" className="rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-related">
        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t("events.calendarGrid.previousMonth")}
          onClick={() => setMonth(shiftMonth(month, -1))}
        >
          ←
        </Button>

        <h3 data-testid="calendar-month" className="font-display text-lg">
          {formatter("month").format(firstOfMonth)}
        </h3>

        <Button
          type="button"
          variant="outline"
          size="sm"
          aria-label={t("events.calendarGrid.nextMonth")}
          onClick={() => setMonth(shiftMonth(month, 1))}
        >
          →
        </Button>
      </div>

      <div className="mt-related grid grid-cols-7 gap-1 text-center text-xs text-ink-muted">
        {weekdayNames().map((name) => (
          <div key={name}>{name}</div>
        ))}
      </div>

      <div className="mt-1 grid grid-cols-7 gap-1">
        {Array.from({ length: leading }, (_, cell) => (
          <div key={`blank-${cell}`} />
        ))}

        {Array.from({ length: daysInMonth }, (_, cell) => {
          const dayNumber = cell + 1;
          const day = `${month}-${String(dayNumber).padStart(2, "0")}`;
          const count = counts.get(day) ?? 0;
          const chosen = selected === day;

          // A day with nothing on it is not a control. Rendering it as a
          // button that answers nothing is how a grid teaches people that
          // tapping it does not work.
          if (count === 0) {
            return (
              <div key={day} className="py-2 text-center text-sm text-ink-muted">
                {dayNumber}
              </div>
            );
          }

          return (
            <button
              key={day}
              type="button"
              aria-pressed={chosen}
              aria-label={t("events.calendarGrid.dayAria", {
                date: formatter("day").format(new Date(`${day}T00:00:00Z`)),
                count,
              })}
              onClick={() => onSelect(chosen ? null : day)}
              className={
                chosen
                  ? "rounded-md bg-primary py-2 text-center text-sm font-medium text-primary-foreground"
                  : "rounded-md border border-primary/40 py-2 text-center text-sm font-medium text-ink hover:bg-accent"
              }
            >
              {dayNumber}
            </button>
          );
        })}
      </div>
    </div>
  );
}
