import { useState } from "react";

import { Button } from "@/components/ui/button";

import type { EventResource, StoreEventRequest } from "../api/generated/model";
import { FormError, FormField, RequiredLegend, formIsValid } from "../components/FormField";
import { t, type TranslatedError } from "../i18n";
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
  registrationOpensDate: string;
  registrationOpensTime: string;
  registrationClosesDate: string;
  registrationClosesTime: string;
  registrationMaxGuests: string;
};

/**
 * The times a registration window gets when the committee has typed only its
 * dates.
 *
 * A window is a decision about DAYS — "the form goes up on the 1st and comes
 * down on the 20th" — and asking for a minute as well would be asking for
 * something nobody has an opinion about. The two defaults make the dates mean
 * what they look like: bookings open at the start of the opening day and shut
 * at the end of the closing one. Both fields are editable, so a committee that
 * does want a minute still has one.
 */
const OPENS_AT_DEFAULT = "00:00";
const CLOSES_AT_DEFAULT = "23:59";

/** An existing event as an editable draft, or an empty one for a new event. */
export function draftFromEvent(event: EventResource | null): EventDraft {
  // Split in Fribourg, never by slicing the ISO string: an event at 00:30
  // local is the previous day in UTC, and the obvious substring puts it in the
  // form a day early. See ./bandTime.
  const start = event ? bandZoneParts(event.startsAt) : null;
  const end = event ? bandZoneParts(event.endsAt) : null;
  const opens = event?.registrationOpensAt ? bandZoneParts(event.registrationOpensAt) : null;
  const closes = event?.registrationClosesAt ? bandZoneParts(event.registrationClosesAt) : null;

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
    registrationOpensDate: opens?.date ?? "",
    registrationOpensTime: opens?.time ?? OPENS_AT_DEFAULT,
    registrationClosesDate: closes?.date ?? "",
    registrationClosesTime: closes?.time ?? CLOSES_AT_DEFAULT,
    // A number in a text box. The empty string is "no cap", which is a
    // different answer from any number including zero, and String(null) would
    // put the word "null" in the field.
    registrationMaxGuests:
      event?.registrationMaxGuests === null || event?.registrationMaxGuests === undefined
        ? ""
        : String(event.registrationMaxGuests),
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
    // THE DATE IS THE SWITCH, and the time beside it is never consulted on
    // its own. An empty closing date sends null, which is what turns public
    // registration off — there is no separate boolean, per D9, because a flag
    // beside a date is a flag that drifts out of step with it. Bookings
    // already taken survive being switched off.
    registrationOpensAt: instantOrNull(draft.registrationOpensDate, draft.registrationOpensTime),
    registrationClosesAt: instantOrNull(draft.registrationClosesDate, draft.registrationClosesTime),
    // Trimmed and re-read rather than passed through `Number`: `Number("")`
    // is 0, and a cap of zero is an event nobody may book rather than an
    // event with no cap. NaN for anything else, which the server refuses
    // against the field the committee typed in.
    registrationMaxGuests:
      draft.registrationMaxGuests.trim() === "" ? null : Number(draft.registrationMaxGuests),
  };
}

/** A typed date and time as an instant, or null when no date was given. */
function instantOrNull(date: string, time: string): string | null {
  if (date.trim() === "") {
    return null;
  }

  return composeInBandZone(date, time);
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
      noValidate
      className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4"
      onSubmit={(submitted) => {
        submitted.preventDefault();
        // aria-disabled, not disabled — so this early return is what actually
        // prevents a double submit.
        if (busy || !formIsValid(submitted.currentTarget)) {
          return;
        }
        onSubmit(draft);
      }}
    >
      <h2 className="font-display text-2xl">
        {event === null
          ? t("eventForm.addTitle")
          : t("eventForm.editTitle", { title: event.title })}
      </h2>

      <RequiredLegend />

      <FormField
        id="title"
        label={t("eventForm.title")}
        value={draft.title}
        onChange={(value) => set("title", value)}
        problem={problemFor("title")}
        required
      />

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="startDate"
          label={t("eventForm.startDate")}
          type="date"
          value={draft.startDate}
          onChange={setStartDate}
          problem={problemFor("startsAt")}
          required
        />
        <FormField
          id="startTime"
          label={t("eventForm.startTime")}
          type="time"
          value={draft.startTime}
          onChange={(value) => set("startTime", value)}
          required
        />
      </div>

      <div className="grid gap-related sm:grid-cols-2">
        <FormField
          id="endDate"
          label={t("eventForm.endDate")}
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
          label={t("eventForm.endTime")}
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
        label={t("eventForm.location")}
        value={draft.location}
        onChange={(value) => set("location", value)}
        problem={problemFor("location")}
        required
      />

      <FormField
        id="attire"
        label={t("eventForm.attire")}
        value={draft.attire}
        onChange={(value) => set("attire", value)}
        problem={problemFor("attire")}
      />
      {/* THE QUOTED WORDS ARE THE CARD'S OWN KEY, not a second copy of them.
          Spelled out here too, the hint and the card could come to disagree
          about what an empty field looks like. */}
      <p className="text-sm text-ink-muted">
        {t("eventForm.attireHint", { unset: t("events.card.attireUnset") })}
      </p>

      <label className="flex min-h-touch items-center gap-2">
        <input
          type="checkbox"
          className="size-5"
          checked={draft.isPublic}
          onChange={(changed) => set("isPublic", changed.target.checked)}
        />
        {t("eventForm.isPublic")}
      </label>

      <FormField
        id="notes"
        label={t("eventForm.notes")}
        as="textarea"
        value={draft.notes}
        onChange={(value) => set("notes", value)}
        problem={problemFor("notes")}
      />

      {/* THE REGISTRATION WINDOW, and the closing date is the switch. There is
          no "activer les inscriptions" checkbox to go out of step with the
          dates — D9, and the same call the API makes. The copy below is what
          carries that, because a date field is not self-evidently a switch. */}
      <fieldset className="flex flex-col gap-related rounded-md border border-line p-4">
        <legend className="px-1 font-display text-lg">{t("eventForm.registrationsLegend")}</legend>

        <p className="text-sm text-ink-muted">{t("eventForm.registrationsHint")}</p>

        <div className="grid gap-related sm:grid-cols-2">
          <FormField
            id="registrationClosesDate"
            label={t("eventForm.closesDate")}
            type="date"
            value={draft.registrationClosesDate}
            onChange={(value) => set("registrationClosesDate", value)}
            problem={problemFor("registrationClosesAt")}
          />
          <FormField
            id="registrationClosesTime"
            label={t("eventForm.closesTime")}
            type="time"
            value={draft.registrationClosesTime}
            onChange={(value) => set("registrationClosesTime", value)}
          />
        </div>

        <div className="grid gap-related sm:grid-cols-2">
          <FormField
            id="registrationOpensDate"
            label={t("eventForm.opensDate")}
            type="date"
            value={draft.registrationOpensDate}
            onChange={(value) => set("registrationOpensDate", value)}
            problem={problemFor("registrationOpensAt")}
          />
          <FormField
            id="registrationOpensTime"
            label={t("eventForm.opensTime")}
            type="time"
            value={draft.registrationOpensTime}
            onChange={(value) => set("registrationOpensTime", value)}
          />
        </div>

        <p className="text-sm text-ink-muted">{t("eventForm.opensHint")}</p>

        <FormField
          id="registrationMaxGuests"
          label={t("eventForm.maxGuests")}
          type="number"
          value={draft.registrationMaxGuests}
          onChange={(value) => set("registrationMaxGuests", value)}
          problem={problemFor("registrationMaxGuests")}
        />
        <p className="text-sm text-ink-muted">{t("eventForm.maxGuestsHint")}</p>
      </fieldset>

      <FormError error={error} />

      <div className="flex flex-wrap gap-related">
        <Button type="submit" aria-disabled={busy}>
          {busy ? t("eventForm.saving") : t("common.save")}
        </Button>
        <Button type="button" variant="outline" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
