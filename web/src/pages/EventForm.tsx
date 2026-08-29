import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { getEventIndexQueryKey, useEventStore, useEventUpdate } from "../api/generated/endpoints";
import type { EventIndex200Item, EventRequest } from "../api/generated/model";
import { ApiError } from "../api/http";
import { translateApiError, type TranslatedError } from "../i18n";

/** What the form edits: the request body the API accepts, plus the id it acts on. */
export type EditableEvent = EventRequest & { id: number };

const EMPTY: EventRequest = {
  date: "",
  title: "",
  startTime: "",
  endTime: "",
  location: "",
  attire: "",
  weekend: false,
};

/**
 * A list row is NOT an EventRequest, and the difference is not cosmetic.
 *
 * `GET /api/events` returns SQL TIMEs ("19:00:00"), `weekend` as 0/1 and
 * `attire` as null; the request body wants HH:MM, a boolean and a string. Feed
 * a row straight into the form and the time inputs come up blank, the checkbox
 * throws on a number, and "Tenue" reads "null" — which is exactly what the old
 * page did with `input.value = event.attire`.
 */
export function toEditableEvent(event: EventIndex200Item): EditableEvent {
  return {
    id: event.id,
    date: event.date,
    title: event.title,
    startTime: event.startTime.slice(0, 5),
    endTime: event.endTime.slice(0, 5),
    location: event.location,
    attire: event.attire ?? "",
    weekend: Boolean(event.weekend),
  };
}

type TextField = "date" | "title" | "startTime" | "endTime" | "location" | "attire";

const FIELDS: { name: TextField; label: string; type: string; required: boolean }[] = [
  { name: "date", label: "Date :", type: "date", required: true },
  { name: "title", label: "Titre :", type: "text", required: true },
  { name: "startTime", label: "Heure de début :", type: "time", required: true },
  { name: "endTime", label: "Heure de fin :", type: "time", required: true },
  { name: "location", label: "Lieu :", type: "text", required: true },
  { name: "attire", label: "Tenue :", type: "text", required: false },
];

/**
 * Create/edit form for an event. Admin-only — the caller gates it.
 *
 * `attire` is deliberately not required: a rehearsal with no dress code is
 * legitimate, and the API's EventRequest agrees.
 */
export function EventForm({
  editing,
  onDone,
}: {
  editing: EditableEvent | null;
  onDone: () => void;
}) {
  const [values, setValues] = useState<EventRequest>(EMPTY);
  const [error, setError] = useState<TranslatedError | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();

  // Fill the form when the list asks to edit an event, and clear it when the
  // edit is finished or cancelled. The form sits below a list that can run to a
  // full season, so bring it into view too — the old page did, and without it
  // clicking "Modifier" on a late event looks like nothing happened.
  useEffect(() => {
    setValues(editing ? { ...editing } : EMPTY);
    setError(null);
    if (editing) {
      // Optional call, not a guard for tidiness: jsdom does not implement
      // scrollIntoView at all, so an unconditional call fails every test.
      form.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  }, [editing]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });

  /**
   * The generated hooks type TError as the DECLARED error models, but what the
   * mutator actually throws is always an ApiError. Narrow with instanceof —
   * never trust the declared type here.
   */
  const onError = (thrown: unknown) => {
    setError(
      thrown instanceof ApiError
        ? translateApiError(thrown)
        : { message: "L’enregistrement a échoué. Veuillez réessayer.", fields: [] },
    );
  };

  const onSuccess = () => {
    setError(null);
    setValues(EMPTY);
    onDone();
    void refresh();
  };

  const create = useEventStore({ mutation: { onSuccess, onError } });
  const update = useEventUpdate({ mutation: { onSuccess, onError } });
  const pending = create.isPending || update.isPending;

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    setError(null);
    if (editing) {
      update.mutate({ id: editing.id, data: values });
    } else {
      create.mutate({ data: values });
    }
  };

  const messageFor = (field: string) =>
    error?.fields.find((entry) => entry.field === field)?.message;

  return (
    <form ref={form} onSubmit={submit} className="mt-8 space-y-3 rounded border p-4">
      <h2 className="text-lg font-bold">
        {editing ? "Modifier l’événement" : "Ajouter un événement"}
      </h2>

      {error ? (
        <p role="alert" className="text-canetons-red">
          {error.message}
        </p>
      ) : null}

      {FIELDS.map((field) => {
        const problem = messageFor(field.name);
        return (
          <div key={field.name} className="flex flex-col gap-1">
            <label htmlFor={`event-${field.name}`}>{field.label}</label>
            <input
              id={`event-${field.name}`}
              type={field.type}
              required={field.required}
              aria-invalid={problem ? true : undefined}
              aria-describedby={problem ? `event-${field.name}-error` : undefined}
              value={values[field.name] ?? ""}
              onChange={(changeEvent) =>
                setValues((previous) => ({ ...previous, [field.name]: changeEvent.target.value }))
              }
              className={`rounded border p-1 ${problem ? "border-canetons-red" : ""}`}
            />
            {problem ? (
              <span id={`event-${field.name}-error`} className="block text-sm text-canetons-red">
                {problem}
              </span>
            ) : null}
          </div>
        );
      })}

      <div className="flex items-center gap-2">
        <input
          id="event-weekend"
          type="checkbox"
          checked={Boolean(values.weekend)}
          onChange={(changeEvent) =>
            setValues((previous) => ({ ...previous, weekend: changeEvent.target.checked }))
          }
        />
        <label htmlFor="event-weekend">Weekend</label>
      </div>

      <div className="flex gap-2">
        {/* Disabled for the duration, and re-enabled by the mutation settling
            either way — a slow network must never leave a legitimate retry
            permanently blocked. */}
        <button type="submit" disabled={pending} className="rounded border px-3 py-1">
          {editing ? "Modifier" : "Ajouter"}
        </button>
        {editing ? (
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            className="rounded border px-3 py-1"
          >
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}
