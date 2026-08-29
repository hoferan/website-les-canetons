import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { getEventIndexQueryKey, useEventStore, useEventUpdate } from "../api/generated/endpoints";
import type { EventIndex200Item, EventRequest } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";

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
  // Seeded from `editing` DURING RENDER, never copied into state by an effect.
  //
  // The caller keys this component on the event being edited, so switching
  // events (or back to "create") remounts it and this initialiser runs again —
  // which is what guarantees the values and the mode always agree in the same
  // commit. Copying them in a useEffect instead paints one frame of an empty
  // form under a "Modifier" button, and web/e2e/planning.spec.ts fails on it.
  //
  // Resetting on a KEY CHANGE and not on every render is the point: a rejected
  // submission leaves `editing` alone, so the admin's typing survives it, which
  // is the old page's behaviour and deliberate.
  const [values, setValues] = useState<EventRequest>(() => (editing ? { ...editing } : EMPTY));
  const { error, setFromThrown, clear, messageFor } = useApiFormError(
    "L’enregistrement a échoué. Veuillez réessayer.",
  );
  const form = useRef<HTMLFormElement>(null);
  const queryClient = useQueryClient();

  // The form sits below a list that can run to a full season, so bring it into
  // view when it opens for editing — the old page did, and without it clicking
  // "Modifier" on a late event looks like nothing happened. On mount only:
  // `editing` cannot change without the key remounting this component.
  useEffect(() => {
    if (editing) {
      // Optional call, not tidiness: jsdom does not implement scrollIntoView at
      // all, so an unconditional call fails every test that opens the form.
      form.current?.scrollIntoView?.({ behavior: "smooth", block: "start" });
    }
  }, [editing]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });

  const onSuccess = () => {
    clear();
    setValues(EMPTY);
    onDone();
    void refresh();
  };

  const create = useEventStore({ mutation: { onSuccess, onError: setFromThrown } });
  const update = useEventUpdate({ mutation: { onSuccess, onError: setFromThrown } });
  const pending = create.isPending || update.isPending;

  const submit = (submitEvent: FormEvent) => {
    submitEvent.preventDefault();
    // Explicit, not implied by the button: aria-disabled leaves the control
    // clickable, and Enter in a field submits through the default button
    // regardless. This early return is the only thing preventing a double save.
    if (pending) return;
    clear();
    if (editing) {
      update.mutate({ id: editing.id, data: values });
    } else {
      create.mutate({ data: values });
    }
  };

  return (
    <form
      ref={form}
      onSubmit={submit}
      className="mt-8 space-y-4 rounded-lg border border-line bg-panel p-5"
    >
      <h2 className="font-display text-xl">
        {editing ? "Modifier l’événement" : "Ajouter un événement"}
      </h2>

      <FormError error={error} />

      {FIELDS.map((field) => (
        <FormField
          key={field.name}
          id={`event-${field.name}`}
          label={field.label}
          type={field.type}
          required={field.required}
          problem={messageFor(field.name)}
          value={values[field.name] ?? ""}
          onChange={(next) => setValues((previous) => ({ ...previous, [field.name]: next }))}
        />
      ))}

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
        {/* Marked unavailable for the duration, and released by the mutation
            settling either way — a slow network must never leave a legitimate
            retry permanently blocked. aria-disabled rather than disabled so the
            focused button is not blurred to <body>; `submit`'s early return is
            the real guard. */}
        <button
          type="submit"
          aria-disabled={pending}
          className="rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90 aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
        >
          {editing ? "Modifier" : "Ajouter"}
        </button>
        {editing ? (
          // Genuinely disabled, unlike the submit beside it: a cancel cannot be
          // double-fired into anything, and keeping it unavailable while a save
          // is in flight is the correct behaviour rather than a focus hazard.
          <button
            type="button"
            onClick={onDone}
            disabled={pending}
            className="rounded border border-line bg-panel px-4 py-2 text-ink hover:border-violet hover:text-violet aria-disabled:cursor-not-allowed aria-disabled:opacity-50"
          >
            Annuler
          </button>
        ) : null}
      </div>
    </form>
  );
}
