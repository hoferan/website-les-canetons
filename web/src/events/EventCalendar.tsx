import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { EventResource } from "../api/generated/model";
import { currentLocale, t } from "../i18n";
import { intlTag } from "../i18n/locale";
import { bandZoneParts } from "./bandTime";
import { OUTLINED_CARD } from "../carnival/raised";

/**
 * The three display formatters, built per call and cached by locale and
 * shape. A module-scope formatter stays bound to the locale active when the
 * file was first imported, so a later switch to German would keep French
 * month names. The weekday names are computed per call for the same reason.
 *
 * The key includes the shape because several shapes share one Intl tag, so a
 * cache keyed on the tag alone would hand back the wrong formatter. The shape
 * key in formatEventWhen.ts does the same.
 *
 * Arithmetic stays in UTC, and `bandTime`'s `en-US` parts extractor stays
 * fixed: it is a machine formatter, and following the active locale would
 * break it silently.
 */
const cache = new Map<string, Intl.DateTimeFormat>();

const SHAPES: Record<"weekday" | "month" | "day", Intl.DateTimeFormatOptions> = {
  weekday: { weekday: "short", timeZone: "UTC" },
  month: { month: "long", year: "numeric", timeZone: "UTC" },
  day: { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" },
};

function formatter(shape: "weekday" | "month" | "day"): Intl.DateTimeFormat {
  const tag = intlTag(currentLocale());
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
 * An overview, not the main feature. It sits behind the `calendar` feature
 * flag (off unless a server's .env enables it), the screen hides it below
 * `md`, and clicking a day filters the list instead of navigating, so the
 * list stays the one way to do the primary job.
 *
 * Hand-rolled with CSS grid and Intl.DateTimeFormat. The project's only
 * runtime dependencies are two fonts, and a calendar library would bring a
 * stylesheet to fight the design tokens for a table of numbers.
 *
 * Arithmetic in UTC, display in Fribourg. A month walked with local Dates
 * crosses the October DST change and lands an hour short, while the day an
 * event belongs to has to be the Fribourg one (see bandZoneParts).
 *
 * A multi-day event is marked once, on the day it starts. Painting both days
 * of a weekend would show two events where the planning below shows one.
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
    // The first event with a date: a draft without one has no month to open on.
    const first = events.find((event) => event.startsAt !== null);
    return first?.startsAt ? monthOf(first.startsAt) : monthOf(new Date().toISOString());
  });

  const counts = new Map<string, number>();
  for (const event of events) {
    if (event.startsAt === null) {
      continue;
    }
    const day = bandZoneParts(event.startsAt).date;
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }

  const [year = 0, index = 1] = month.split("-").map(Number);
  const firstOfMonth = new Date(Date.UTC(year, index - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, index, 0)).getUTCDate();
  // getUTCDay() calls Sunday 0; the week here starts on Monday.
  const leading = (firstOfMonth.getUTCDay() + 6) % 7;

  return (
    <div data-testid="event-calendar" className={`${OUTLINED_CARD} p-4`}>
      <div className="flex items-center justify-between gap-related">
        <Button
          type="button"
          variant="raised-light"
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
          variant="raised-light"
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

          // A day with nothing on it is not a control: a button that answers
          // nothing teaches people that tapping the grid does not work.
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
