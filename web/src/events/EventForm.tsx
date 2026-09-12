import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { EventResource, StoreEventRequest } from "../api/generated/model";
import { FormError, FormField } from "../components/FormField";
import type { TranslatedError } from "../i18n";
import { bandZoneParts, composeInBandZone } from "./bandTime";

export type EventDraft = {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  attire: string;
  isPublic: boolean;
  notes: string;
};

/** An existing event as an editable draft, or an empty one for a new event. */
export function draftFromEvent(event: EventResource | null): EventDraft {
  // Split in Fribourg, never by slicing the ISO string: an event at 00:30
  // local is the previous day in UTC, and the obvious substring puts it in the
  // form a day early. See ./bandTime.
  const start = event ? bandZoneParts(event.startsAt) : null;
  const end = event ? bandZoneParts(event.endsAt) : null;

  return {
    title: event?.title ?? "",
    startDate: start?.date ?? "",
    startTime: start?.time ?? "",
    endDate: end?.date ?? "",
    endTime: end?.time ?? "",
    location: event?.location ?? "",
    attire: event?.attire ?? "",
    isPublic: event?.isPublic ?? false,
    notes: event?.notes ?? "",
  };
}

/**
 * A draft as the API takes it.
 *
 * The two instants are composed WITH THE FRIBOURG OFFSET rather than sent as
 * bare local strings. The server honours an offset it is given and reads an
 * offsetless string as UTC, so omitting it is not a formatting detail — it is
 * a one- or two-hour scheduling error that nobody notices until somebody
 * arrives late.
 *
 * An empty optional field is sent as `null`, not as `""`: `attire` is
 * nullable and the card renders "Non précisée" for null, while an empty string
 * is a value that was specified and happens to be blank. On a PATCH the same
 * null is what CLEARS a tenue that had been set.
 */
export function eventBodyFrom(draft: EventDraft): StoreEventRequest {
  return {
    title: draft.title,
    startsAt: composeInBandZone(draft.startDate, draft.startTime),
    endsAt: composeInBandZone(draft.endDate, draft.endTime),
    location: draft.location,
    attire: draft.attire.trim() === "" ? null : draft.attire,
    isPublic: draft.isPublic,
    notes: draft.notes.trim() === "" ? null : draft.notes,
  };
}

/**
 * Create or correct one event.
 *
 * SEPARATE DATE AND TIME INPUTS, NOT `datetime-local`. Two reasons, and the
 * second is the one that settles it: its rendering and its keyboard vary
 * wildly between mobile browsers, and the series generator next door needs a
 * time with no date at all — so one shape covers both screens and the two
 * cannot drift apart.
 *
 * THE END DATE FOLLOWS THE START AS IT IS TYPED, until somebody edits the end
 * themselves. Almost every event the band runs is one day; making the
 * committee type the same date twice, forty times a season, is exactly the
 * friction that stops a planning being entered at all. A two-day event — the
 * musical weekend — is still one field away, which is why the field stays
 * rather than being replaced by a "same day" checkbox.
 *
 * IT DOES NOT PRE-EMPT THE SERVER'S RULES. An end before the start is refused
 * by the API and the refusal is rendered against the end field; a second copy
 * of the rule here would be one more thing to drift, and the two would then
 * disagree in front of somebody trying to fix a date.
 *
 * `isPublic` is a checkbox written out by hand rather than through FormField,
 * for the reason FormField's own docblock gives: the value is a boolean and
 * the label belongs after the control. It carries `min-h-touch` explicitly,
 * being neither a Button nor an Input.
 */
export function EventForm({
  event,
  busy,
  error,
  problemFor,
  onSubmit,
  onCancel,
}: {
  event: EventResource | null;
  busy: boolean;
  error: TranslatedError | null;
  problemFor: (field: string) => string | undefined;
  onSubmit: (draft: EventDraft) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<EventDraft>(() => draftFromEvent(event));

  // Whether the end date is the organiser's own answer or the start's echo.
  // An existing event's end date is theirs by definition — it was saved once
  // already — so editing a two-day event and moving its start must not quietly
  // collapse it onto one day.
  const [endDateIsOwn, setEndDateIsOwn] = useState(
    event !== null && draft.startDate !== draft.endDate,
  );

  function set<K extends keyof EventDraft>(key: K, value: EventDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function setStartDate(value: string) {
    setDraft((current) => ({
      ...current,
      startDate: value,
      endDate: endDateIsOwn ? current.endDate : value,
    }));
  }

  return (
    <form
      className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        // aria-disabled, not disabled — so this early return is what actually
        // prevents a double submit.
        if (busy) {
          return;
        }
        onSubmit(draft);
      }}
    >
      <h2 className="font-display text-2xl">
        {event === null ? "Ajouter un événement" : `Modifier ${event.title}`}
      </h2>

      <FormField
        id="title"
        label="Titre"
        value={draft.title}
        onChange={(value) => set("title", value)}
        problem={problemFor("title")}
        required
      />

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="startDate"
          label="Date de début"
          type="date"
          value={draft.startDate}
          onChange={setStartDate}
          problem={problemFor("startsAt")}
          required
        />
        <FormField
          id="startTime"
          label="Heure de début"
          type="time"
          value={draft.startTime}
          onChange={(value) => set("startTime", value)}
          required
        />
      </div>

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="endDate"
          label="Date de fin"
          type="date"
          value={draft.endDate}
          onChange={(value) => {
            setEndDateIsOwn(true);
            set("endDate", value);
          }}
          required
        />
        <FormField
          id="endTime"
          label="Heure de fin"
          type="time"
          value={draft.endTime}
          onChange={(value) => set("endTime", value)}
          // The end of the event is where "doit être après le début" belongs:
          // it is the field the organiser has to change to fix it.
          problem={problemFor("endsAt")}
          required
        />
      </div>

      <FormField
        id="location"
        label="Lieu"
        value={draft.location}
        onChange={(value) => set("location", value)}
        problem={problemFor("location")}
        required
      />

      <FormField
        id="attire"
        label="Tenue"
        value={draft.attire}
        onChange={(value) => set("attire", value)}
        problem={problemFor("attire")}
      />
      <p className="text-sm text-ink-muted">
        Laissez vide si la tenue n’est pas encore décidée&nbsp;: la carte affichera «&nbsp;Non
        précisée&nbsp;».
      </p>

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
        problem={problemFor("notes")}
      />

      <FormError error={error} />

      <div className="flex flex-wrap gap-related">
        <Button type="submit" aria-disabled={busy}>
          {busy ? "Enregistrement…" : "Enregistrer"}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
      </div>
    </form>
  );
}
