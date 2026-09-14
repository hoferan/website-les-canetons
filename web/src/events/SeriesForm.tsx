import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";

import type { StoreEventSeriesRequest } from "../api/generated/model";
import { FormError, FormField } from "../components/FormField";
import type { TranslatedError } from "../i18n";
import { weekdayDatesBetween } from "./eventDates";

/**
 * The most dates one request may generate. The SERVER is the enforcement
 * point — `dates` is `max:60` there — and this is here only so a committee
 * entering two seasons at once is told before pressing rather than by a
 * refusal afterwards.
 */
const CAP = 60;

/** `Date.getDay()` values, as the select offers them. */
const WEEKDAYS = [
  { value: 1, label: "Lundi" },
  { value: 2, label: "Mardi" },
  { value: 3, label: "Mercredi" },
  { value: 4, label: "Jeudi" },
  { value: 5, label: "Vendredi" },
  { value: 6, label: "Samedi" },
  { value: 0, label: "Dimanche" },
];

/**
 * One generated date, as a member reads it.
 *
 * IN UTC, which looks wrong beside `formatEventWhen`'s Europe/Zurich and is
 * not. What is being rendered here is a bare calendar date, built by
 * `weekdayDatesBetween` as a `Y-m-d` string; reading it back at UTC midnight
 * and formatting in the same zone returns the day it names. Formatting it in
 * Fribourg would shift the earlier half of the year back to the previous day.
 */
const PREVIEW_DATE = new Intl.DateTimeFormat("fr-CH", {
  timeZone: "UTC",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

type SeriesDraft = {
  title: string;
  location: string;
  attire: string;
  isPublic: boolean;
  notes: string;
  startTime: string;
  endTime: string;
  weekday: number;
  from: string;
  to: string;
};

/**
 * Saturday, 10:00 to 12:00 — the band's actual rehearsal, which is what this
 * screen is for. A generator whose defaults are empty is one where thirteen
 * rehearsals still cost thirteen decisions.
 */
const EMPTY: SeriesDraft = {
  title: "",
  location: "",
  attire: "",
  isPublic: false,
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
 * THE PREVIEW IS THE FEATURE, not decoration on a generate button. Measured
 * against the band's real planning: thirteen Saturday rehearsals, of which
 * four are skipped for school holidays. A straight generate would create four
 * events nobody wants and leave the committee deleting them one at a time,
 * which is worse than entering them by hand.
 *
 * EVERY DATE STARTS TICKED because the common case is all of them, and the
 * ticks RESET whenever the range or the weekday changes. A tick state that
 * survived would be applied to whichever dates now sit at those positions, and
 * the season would be quietly missing a rehearsal nobody chose to skip.
 *
 * THE BUTTON NAMES THE COUNT. A generator whose button says only "Créer" is
 * one nobody checks before pressing, and this one writes up to sixty rows.
 *
 * What it generates are INDEPENDENT EVENTS (C3). Nothing links them: there is
 * no series row, no recurrence rule and no `series_id`, so "how does a player
 * attend one occurrence?" is not a question anybody has to answer. This form
 * is the only thing that ever knows they arrived together, and it forgets as
 * soon as it has posted them.
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

  return (
    <form
      className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        if (busy || tooMany || chosen.length === 0) {
          return;
        }
        onSubmit({
          template: {
            title: draft.title,
            location: draft.location,
            attire: draft.attire.trim() === "" ? null : draft.attire,
            isPublic: draft.isPublic,
            notes: draft.notes.trim() === "" ? null : draft.notes,
            startTime: draft.startTime,
            endTime: draft.endTime,
          },
          dates: chosen,
        });
      }}
    >
      <h2 className="font-display text-2xl">Une série d’événements</h2>
      <p className="text-sm text-ink-muted">
        Toutes les dates reçoivent le même titre, le même lieu et les mêmes horaires. Chacune
        devient un événement indépendant&nbsp;: en modifier une plus tard ne touche pas les autres.
      </p>

      <FormField
        id="title"
        label="Titre"
        value={draft.title}
        onChange={(value) => set("title", value)}
        problem={problemFor("template.title")}
        required
      />

      <FormField
        id="location"
        label="Lieu"
        value={draft.location}
        onChange={(value) => set("location", value)}
        problem={problemFor("template.location")}
        required
      />

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="startTime"
          label="Heure de début"
          type="time"
          value={draft.startTime}
          onChange={(value) => set("startTime", value)}
          problem={problemFor("template.startTime")}
          required
        />
        <FormField
          id="endTime"
          label="Heure de fin"
          type="time"
          value={draft.endTime}
          onChange={(value) => set("endTime", value)}
          problem={problemFor("template.endTime")}
          required
        />
      </div>

      <div className="flex flex-col gap-1">
        <label htmlFor="weekday">Jour de la semaine</label>
        <select
          id="weekday"
          className="focus-ring min-h-touch rounded-md border border-line bg-panel px-3 text-ink"
          value={draft.weekday}
          onChange={(changed) => setGenerator("weekday", Number(changed.target.value))}
        >
          {WEEKDAYS.map((day) => (
            <option key={day.value} value={day.value}>
              {day.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="from"
          label="Du"
          type="date"
          value={draft.from}
          onChange={(value) => setGenerator("from", value)}
          required
        />
        <FormField
          id="to"
          label="Au"
          type="date"
          value={draft.to}
          onChange={(value) => setGenerator("to", value)}
          required
        />
      </div>

      <FormField
        id="attire"
        label="Tenue"
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
        Visible sur le site public
      </label>

      <FormField
        id="notes"
        label="Remarques"
        as="textarea"
        value={draft.notes}
        onChange={(value) => set("notes", value)}
        problem={problemFor("template.notes")}
      />

      {dates.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Choisissez un jour et une période pour voir les dates qui seront créées.
        </p>
      ) : (
        <fieldset data-testid="series-preview" className="flex flex-col gap-1">
          <legend>Dates à créer</legend>
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
              {PREVIEW_DATE.format(new Date(`${date}T00:00:00Z`))}
            </label>
          ))}
        </fieldset>
      )}

      {tooMany ? (
        <p role="alert" className="text-danger">
          {chosen.length} dates sélectionnées&nbsp;: {CAP} au maximum par série. Décochez-en ou
          raccourcissez la période.
        </p>
      ) : null}

      <FormError error={error} />

      <div className="flex flex-wrap gap-related">
        {/* Absent, not inert, while there is nothing to create: a button
            offering to create zero events is a question with no answer. */}
        {chosen.length > 0 ? (
          <Button type="submit" aria-disabled={busy || tooMany}>
            {busy
              ? "Création…"
              : `Créer ${chosen.length} ${chosen.length === 1 ? "événement" : "événements"}`}
          </Button>
        ) : null}
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
