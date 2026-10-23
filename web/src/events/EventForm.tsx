import { useRef, useState } from "react";

import { Button } from "@/components/ui/button";

import type { EventResource, StoreEventRequest } from "../api/generated/model";
import { FormError, FormField, RequiredLegend, formIsValid } from "../components/FormField";
import { t, type TranslatedError } from "../i18n";
import { PhotoField } from "../images/PhotoField";
import { bandZoneParts, composeInBandZone } from "./bandTime";
import type { PosterChange } from "./saveEventPoster";
import { TagPicker } from "./TagPicker";
import { OUTLINED_CARD } from "../carnival/raised";

export type EventDraft = {
  title: string;
  startDate: string;
  startTime: string;
  endDate: string;
  endTime: string;
  location: string;
  attire: string;
  isPublic: boolean;
  tagIds: number[];
  notes: string;
  registrationOpensDate: string;
  registrationOpensTime: string;
  registrationClosesDate: string;
  registrationClosesTime: string;
  registrationMaxGuests: string;
  registrationEnabled: boolean;
  registrationAsksAddress: boolean;
  registrationAsksTable: boolean;
};

/**
 * The times a registration window gets when the committee has typed only its
 * dates.
 *
 * A window is a decision about days, and nobody has an opinion about the
 * minute. The defaults make the dates mean what they look like: bookings open
 * at the start of the opening day and shut at the end of the closing one. Both
 * times stay editable.
 */
const OPENS_AT_DEFAULT = "00:00";
const CLOSES_AT_DEFAULT = "23:59";

/** An existing event as an editable draft, or an empty one for a new event. */
export function draftFromEvent(event: EventResource | null): EventDraft {
  // Split in Fribourg, never by slicing the ISO string (see ./bandTime). A
  // draft may have no dates yet, and its boxes are then empty.
  const start = event?.startsAt ? bandZoneParts(event.startsAt) : null;
  const end = event?.endsAt ? bandZoneParts(event.endsAt) : null;
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
    tagIds: event?.tags.map((tag) => tag.id) ?? [],
    notes: event?.notes ?? "",
    registrationOpensDate: opens?.date ?? "",
    registrationOpensTime: opens?.time ?? OPENS_AT_DEFAULT,
    registrationClosesDate: closes?.date ?? "",
    registrationClosesTime: closes?.time ?? CLOSES_AT_DEFAULT,
    // The empty string is "no cap", a different answer from any number
    // including zero, and String(null) would put "null" in the field.
    registrationMaxGuests:
      event?.registrationMaxGuests === null || event?.registrationMaxGuests === undefined
        ? ""
        : String(event.registrationMaxGuests),
    // A new form starts closed and asks for both details (ADR 0033).
    registrationEnabled: event?.registrationEnabled ?? false,
    registrationAsksAddress: event?.registrationAsksAddress ?? true,
    registrationAsksTable: event?.registrationAsksTable ?? true,
  };
}

/**
 * A draft as the API takes it.
 *
 * The instants carry the Fribourg offset: the server reads an offsetless
 * string as UTC, which would put every event an hour or two out.
 *
 * An empty optional field is sent as `null`, not `""`. The card renders its
 * "not specified" text for a null `attire`, while an empty string is a value
 * that happens to be blank. On a PATCH the same null clears an attire that had
 * been set.
 */
export function eventBodyFrom(draft: EventDraft): StoreEventRequest {
  return {
    title: draft.title,
    // A draft may lack these and sends null: a blank date is no date, not an
    // invalid one. On a published event the `required` attributes keep them
    // from being blank.
    startsAt: instantOrNull(draft.startDate, draft.startTime),
    endsAt: instantOrNull(draft.endDate, draft.endTime),
    location: draft.location.trim() === "" ? null : draft.location,
    attire: draft.attire.trim() === "" ? null : draft.attire,
    isPublic: draft.isPublic,
    // Always sent, the whole set: the API replaces an event's tags with what
    // arrives.
    tagIds: draft.tagIds,
    notes: draft.notes.trim() === "" ? null : draft.notes,
    // The date is the switch; the time beside it is never read on its own. An
    // empty closing date sends null, which turns public registration off.
    // There is no separate flag to drift out of step (ADR 0020). Bookings
    // already taken survive being switched off.
    registrationOpensAt: instantOrNull(draft.registrationOpensDate, draft.registrationOpensTime),
    registrationClosesAt: instantOrNull(draft.registrationClosesDate, draft.registrationClosesTime),
    // Blank is checked first because `Number("")` is 0, and a cap of zero is
    // an event nobody may book. Anything unparseable becomes NaN, which the
    // server refuses against this field.
    registrationMaxGuests:
      draft.registrationMaxGuests.trim() === "" ? null : Number(draft.registrationMaxGuests),
    registrationEnabled: draft.registrationEnabled,
    registrationAsksAddress: draft.registrationAsksAddress,
    registrationAsksTable: draft.registrationAsksTable,
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
 * Separate date and time inputs, not `datetime-local`: its rendering and
 * keyboard vary between mobile browsers, and the series generator needs a
 * time with no date, so one shape serves both screens.
 *
 * The end date follows the start as it is typed, until somebody edits the end
 * themselves. Almost every event is one day, and typing the same date twice
 * forty times a season is friction. A two-day event is still one field away.
 *
 * It does not duplicate the server's rules. An end before the start is
 * refused by the API and the refusal is rendered against the end field; a
 * second copy here could come to disagree with it.
 *
 * `isPublic` is a hand-written checkbox rather than a FormField, for the
 * reason FormField's docblock gives: the value is a boolean and the label
 * follows the control. It carries `min-h-touch` itself, being neither a
 * Button nor an Input.
 */
export function EventForm({
  event,
  mode,
  busy,
  error,
  problemFor,
  onSubmit,
  onCancel,
}: {
  event: EventResource | null;
  /**
   * `draft`: only the title is required, and there are two ways to finish,
   * save it as it is or publish it. `published`: an event the band already
   * sees keeps every rule, and there is one way to finish.
   */
  mode: "draft" | "published";
  busy: boolean;
  error: TranslatedError | null;
  problemFor: (field: string) => string | undefined;
  /**
   * `poster` is null when the organiser left it alone. It has a write of its
   * own, after the event's, because the event's slot is named by its id.
   */
  onSubmit: (draft: EventDraft, intent: "save" | "publish", poster: PosterChange) => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<EventDraft>(() => draftFromEvent(event));
  const [poster, setPoster] = useState<PosterChange>(null);

  // Which button submitted, read from the click just before the submit
  // event. Enter in a field clicks the first button, so it saves and never
  // publishes by accident.
  const intent = useRef<"save" | "publish">("save");
  const isDraftMode = mode === "draft";

  // Whether the end date is the organiser's own answer or the start's echo.
  // A saved two-day event's end date is theirs, so moving its start must not
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
      className={`${OUTLINED_CARD} mt-block flex flex-col gap-related p-4`}
      onSubmit={(submitted) => {
        submitted.preventDefault();
        // The buttons are aria-disabled, not disabled, so this early return is
        // what prevents a double submit.
        if (busy || !formIsValid(submitted.currentTarget)) {
          return;
        }
        const chosen = intent.current;
        intent.current = "save";
        onSubmit(draft, chosen, poster);
      }}
    >
      <h2 className="font-display text-2xl">
        {event === null
          ? t("eventForm.addTitle")
          : t("eventForm.editTitle", { title: event.title })}
      </h2>

      <RequiredLegend />

      {isDraftMode ? <p className="text-sm text-ink-muted">{t("eventForm.draftHint")}</p> : null}

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
          required={!isDraftMode || draft.startTime !== ""}
        />
        <FormField
          id="startTime"
          label={t("eventForm.startTime")}
          type="time"
          value={draft.startTime}
          onChange={(value) => set("startTime", value)}
          required={!isDraftMode || draft.startDate !== ""}
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
          required={!isDraftMode || draft.endTime !== ""}
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
          required={!isDraftMode || draft.endDate !== ""}
        />
      </div>

      <FormField
        id="location"
        label={t("eventForm.location")}
        value={draft.location}
        onChange={(value) => set("location", value)}
        problem={problemFor("location")}
        required={!isDraftMode}
      />

      <FormField
        id="attire"
        label={t("eventForm.attire")}
        value={draft.attire}
        onChange={(value) => set("attire", value)}
        problem={problemFor("attire")}
      />
      {/* The quoted words are the card's own key, so the hint and the card
          cannot disagree about what an empty field looks like. */}
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

      <TagPicker value={draft.tagIds} onChange={(tagIds) => set("tagIds", tagIds)} />

      <FormField
        id="notes"
        label={t("eventForm.notes")}
        as="textarea"
        value={draft.notes}
        onChange={(value) => set("notes", value)}
        problem={problemFor("notes")}
      />

      <PhotoField
        label={t("eventForm.poster")}
        value={poster ? poster.photo : (event?.poster ?? null)}
        onChange={(imageId, photo) => setPoster({ imageId, photo })}
      />

      {/* The registration window. The closing date is the switch, with no
          separate checkbox (ADR 0020); the hint below says so, because a
          date field is not self-evidently a switch. */}
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

        {/* The form's own switches, here until the form editor (#319) takes
            them with the closing date and the cap. */}
        {(
          [
            ["registrationEnabled", "eventForm.formOpen"],
            ["registrationAsksAddress", "eventForm.asksAddress"],
            ["registrationAsksTable", "eventForm.asksTable"],
          ] as const
        ).map(([field, label]) => (
          <label key={field} className="flex min-h-touch items-center gap-2">
            <input
              type="checkbox"
              className="size-5"
              checked={draft[field]}
              onChange={(changed) => set(field, changed.target.checked)}
            />
            {t(label)}
          </label>
        ))}
        <p className="text-sm text-ink-muted">{t("eventForm.formOpenHint")}</p>
      </fieldset>

      <FormError error={error} />

      <div className="flex flex-wrap gap-related">
        {isDraftMode ? (
          <>
            <Button type="submit" aria-disabled={busy} onClick={() => (intent.current = "save")}>
              {busy ? t("eventForm.saving") : t("eventForm.saveDraft")}
            </Button>
            {/* Publishing is the deliberate act, so it comes second and is
                outlined: Enter never reaches for it. */}
            <Button
              type="submit"
              variant="raised-light"
              aria-disabled={busy}
              onClick={() => (intent.current = "publish")}
            >
              {t("eventForm.publish")}
            </Button>
          </>
        ) : (
          <Button type="submit" aria-disabled={busy}>
            {busy ? t("eventForm.saving") : t("common.save")}
          </Button>
        )}
        <Button type="button" variant="raised-light" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}
