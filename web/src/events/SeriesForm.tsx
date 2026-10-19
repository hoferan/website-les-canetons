import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import type { StoreEventSeriesRequest } from "../api/generated/model";
import { FormError, FormField, RequiredLegend, formIsValid } from "../components/FormField";
import { currentLocale, t, type TranslatedError } from "../i18n";
import { intlTag } from "../i18n/locale";
import { weekdayDatesBetween } from "./eventDates";
import { TagPicker } from "./TagPicker";
import { OUTLINED_CARD } from "../carnival/raised";

/**
 * The most dates one request may generate. The server enforces it (`dates` is
 * `max:60`); this copy only tells a committee entering two seasons at once
 * before pressing.
 */
const CAP = 60;

/**
 * `Date.getDay()` values, as the select offers them.
 *
 * `labelKey`, never `label`, as in Layout.tsx's NAV: a module-level
 * `label: t(...)` is frozen in the locale active when the module was first
 * imported. The key is resolved at render.
 */
const WEEKDAYS = [
  { value: 1, labelKey: "seriesForm.weekdays.monday" },
  { value: 2, labelKey: "seriesForm.weekdays.tuesday" },
  { value: 3, labelKey: "seriesForm.weekdays.wednesday" },
  { value: 4, labelKey: "seriesForm.weekdays.thursday" },
  { value: 5, labelKey: "seriesForm.weekdays.friday" },
  { value: 6, labelKey: "seriesForm.weekdays.saturday" },
  { value: 0, labelKey: "seriesForm.weekdays.sunday" },
] as const;

/**
 * One generated date, as a member reads it.
 *
 * In UTC, unlike `formatEventWhen`'s Europe/Zurich, because this is a bare
 * calendar date from `weekdayDatesBetween`. Read back at UTC midnight and
 * formatted in the same zone, it returns the day it names; in a zone behind
 * UTC it would show the previous day.
 */
const previewCache = new Map<string, Intl.DateTimeFormat>();

function previewDate(): Intl.DateTimeFormat {
  const tag = intlTag(currentLocale());

  let found = previewCache.get(tag);
  if (!found) {
    found = new Intl.DateTimeFormat(tag, {
      timeZone: "UTC",
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
    previewCache.set(tag, found);
  }

  return found;
}

type SeriesDraft = {
  title: string;
  location: string;
  attire: string;
  isPublic: boolean;
  tagIds: number[];
  notes: string;
  startTime: string;
  endTime: string;
  weekday: number;
  from: string;
  to: string;
};

/**
 * Saturday, 10:00 to 12:00: the band's actual rehearsal, which is what this
 * screen is for.
 */
const EMPTY: SeriesDraft = {
  title: "",
  location: "",
  attire: "",
  isPublic: false,
  tagIds: [],
  notes: "",
  startTime: "10:00",
  endTime: "12:00",
  weekday: 6,
  from: "",
  to: "",
};

/**
 * Thirteen rehearsals as one form and a few unticks.
 *
 * The preview is the feature. A season has some rehearsals skipped for school
 * holidays, and a straight generate would leave the committee deleting those
 * one at a time.
 *
 * Every date starts ticked, because the common case is all of them, and the
 * ticks reset whenever the range or the weekday changes. Otherwise a skip
 * would land on whichever date now sits in that position.
 *
 * The button names the count, because this writes up to sixty rows. Until a
 * date is chosen there is no count, and the button is inert.
 *
 * The generated events are independent: no series row, no recurrence rule, no
 * `series_id`. Only this form knows they arrived together, and it forgets once
 * it has posted them.
 */
export function SeriesForm({
  busy,
  error,
  problemFor,
  onSubmit,
  onCancel,
}: {
  busy: boolean;
  error: TranslatedError | null;
  problemFor: (field: string) => string | undefined;
  onSubmit: (request: StoreEventSeriesRequest) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<SeriesDraft>(EMPTY);
  const [skipped, setSkipped] = useState<string[]>([]);

  const dates = useMemo(
    () => weekdayDatesBetween(draft.from, draft.to, draft.weekday),
    [draft.from, draft.to, draft.weekday],
  );

  const chosen = dates.filter((date) => !skipped.includes(date));

  function set<K extends keyof SeriesDraft>(key: K, value: SeriesDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  /** Changing what is generated throws away which of the old dates were skipped. */
  function setGenerator<K extends "from" | "to" | "weekday">(key: K, value: SeriesDraft[K]) {
    setSkipped([]);
    set(key, value);
  }

  const tooMany = chosen.length > CAP;

  // Why the button cannot be pressed yet, as the id of the line that says so,
  // or null when it can. The button is described by that line, so a screen
  // reader hears the reason with it.
  const blockedBy =
    dates.length === 0
      ? "series-no-dates"
      : chosen.length === 0
        ? "series-none-chosen"
        : tooMany
          ? "series-too-many"
          : null;

  return (
    <form
      noValidate
      className={`${OUTLINED_CARD} mt-block flex flex-col gap-related p-4`}
      onSubmit={(submitted) => {
        submitted.preventDefault();
        if (busy || tooMany || chosen.length === 0 || !formIsValid(submitted.currentTarget)) {
          return;
        }
        onSubmit({
          template: {
            title: draft.title,
            location: draft.location,
            attire: draft.attire.trim() === "" ? null : draft.attire,
            isPublic: draft.isPublic,
            tagIds: draft.tagIds,
            notes: draft.notes.trim() === "" ? null : draft.notes,
            startTime: draft.startTime,
            endTime: draft.endTime,
          },
          dates: chosen,
        });
      }}
    >
      <h2 className="font-display text-2xl">{t("seriesForm.heading")}</h2>
      <p className="text-sm text-ink-muted">{t("seriesForm.intro")}</p>
      <p className="text-sm text-ink-muted">{t("seriesForm.draftsNote")}</p>
      <RequiredLegend />

      <FormField
        id="title"
        label={t("eventForm.title")}
        value={draft.title}
        onChange={(value) => set("title", value)}
        problem={problemFor("template.title")}
        required
      />

      <FormField
        id="location"
        label={t("eventForm.location")}
        value={draft.location}
        onChange={(value) => set("location", value)}
        problem={problemFor("template.location")}
        required
      />

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="startTime"
          label={t("eventForm.startTime")}
          type="time"
          value={draft.startTime}
          onChange={(value) => set("startTime", value)}
          problem={problemFor("template.startTime")}
          required
        />
        <FormField
          id="endTime"
          label={t("eventForm.endTime")}
          type="time"
          value={draft.endTime}
          onChange={(value) => set("endTime", value)}
          problem={problemFor("template.endTime")}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="weekday">{t("seriesForm.weekday")}</label>
        <select
          id="weekday"
          className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
          value={draft.weekday}
          onChange={(changed) => setGenerator("weekday", Number(changed.target.value))}
        >
          {WEEKDAYS.map((day) => (
            <option key={day.value} value={day.value}>
              {t(day.labelKey)}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="from"
          label={t("seriesForm.from")}
          type="date"
          value={draft.from}
          onChange={(value) => setGenerator("from", value)}
          required
        />
        <FormField
          id="to"
          label={t("seriesForm.to")}
          type="date"
          value={draft.to}
          onChange={(value) => setGenerator("to", value)}
          required
        />
      </div>

      <FormField
        id="attire"
        label={t("eventForm.attire")}
        value={draft.attire}
        onChange={(value) => set("attire", value)}
        problem={problemFor("template.attire")}
      />

      <label className="flex min-h-touch items-center gap-2">
        <input
          type="checkbox"
          className="size-5"
          checked={draft.isPublic}
          onChange={(changed) => set("isPublic", changed.target.checked)}
        />
        {t("eventForm.isPublic")}
      </label>

      <TagPicker value={draft.tagIds} onChange={(tagIds) => set("tagIds", tagIds)} />

      <FormField
        id="notes"
        label={t("eventForm.notes")}
        as="textarea"
        value={draft.notes}
        onChange={(value) => set("notes", value)}
        problem={problemFor("template.notes")}
      />

      {dates.length === 0 ? (
        <p id="series-no-dates" className="text-sm text-ink-muted">
          {t("seriesForm.noDates")}
        </p>
      ) : (
        <fieldset data-testid="series-preview" className="flex flex-col gap-1">
          <legend>{t("seriesForm.datesLegend")}</legend>
          {dates.map((date) => (
            <label key={date} className="flex min-h-touch items-center gap-2">
              <input
                type="checkbox"
                className="size-5"
                checked={!skipped.includes(date)}
                onChange={(changed) =>
                  setSkipped((current) =>
                    changed.target.checked
                      ? current.filter((other) => other !== date)
                      : [...current, date],
                  )
                }
              />
              {previewDate().format(new Date(`${date}T00:00:00Z`))}
            </label>
          ))}
        </fieldset>
      )}

      {tooMany ? (
        <p id="series-too-many" role="alert" className="text-danger">
          {/* {{n}}, not {{count}}: this line only appears above the cap, so
              it has no singular form for a `count` option to select. */}
          {t("seriesForm.tooMany", { n: chosen.length, cap: CAP })}
        </p>
      ) : null}

      {dates.length > 0 && chosen.length === 0 ? (
        <p id="series-none-chosen" className="text-sm text-ink-muted">
          {t("seriesForm.noneChosen")}
        </p>
      ) : null}

      <FormError error={error} />

      <div className="flex flex-wrap gap-related">
        {/* Present from the start, inert until there is something to create:
            with "Annuler" as the only action the form reads as broken. With
            no count to name, it says what it will do. */}
        <Button
          type="submit"
          aria-disabled={busy || blockedBy !== null}
          aria-describedby={blockedBy ?? undefined}
        >
          {busy
            ? t("seriesForm.creating")
            : chosen.length > 0
              ? t("seriesForm.create", { count: chosen.length })
              : t("seriesForm.createNone")}
        </Button>
        <Button type="button" variant="raised-light" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
