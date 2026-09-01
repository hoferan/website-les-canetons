import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";

import { getEventIndexQueryKey, useEventDestroy } from "../api/generated/endpoints";
import type { EditableEvent } from "./EventForm";

/**
 * Real <button>s, not the old page's click handlers on <span>s.
 *
 * That is a deliberate parity BREAK: the old controls were keyboard-unreachable
 * and unnamed to a screen reader. Everything else about the page reproduces the
 * old behaviour; this one does not, because reproducing it would mean shipping
 * an accessibility bug on purpose.
 *
 * For the same reason the accessible name carries the event's title. The visible
 * label is the short word next to the icon, but a list of three buttons all
 * announced as "Supprimer" is unusable without sight of the row they sit in.
 *
 * NOT ABSOLUTELY POSITIONED ANY MORE. This was `absolute top-2 right-2`, and at
 * 390px the two buttons rendered ON TOP of the event date — "dimanche 20
 * se[Modifier]2(" — hiding the one thing the card exists to tell you. Desktop at
 * 1280 was fine, which is why it shipped. Neither suite could catch it: both
 * assert on roles and text, and the text was all present in the DOM. It was only
 * wrong on screen.
 *
 * It renders into EventCard's `actions` footer slot now. A footer cannot overlap
 * a heading at any width, which is why the fix is structural rather than a
 * spacing tweak.
 */
export function EventActions({
  event,
  onEdit,
}: {
  event: EditableEvent;
  onEdit: (event: EditableEvent) => void;
}) {
  const queryClient = useQueryClient();
  const destroy = useEventDestroy({
    mutation: {
      onSuccess: () => void queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() }),
      onError: () => window.alert("La suppression de l’événement a échoué. Veuillez réessayer."),
    },
  });

  return (
    // A fragment: EventCard's `actions` slot is already the flex footer row.
    <>
      <button
        type="button"
        aria-label={`Modifier ${event.title}`}
        onClick={() => onEdit(event)}
        className="flex flex-1 items-center gap-1 rounded border border-line bg-panel px-2 py-1 text-sm text-ink hover:border-violet hover:text-violet sm:flex-none"
      >
        <Pencil aria-hidden="true" className="size-4" />
        Modifier
      </button>
      {/* aria-disabled rather than disabled, for the same reason as every
          submit button in the app: disabling the focused control blurs it to
          <body>. The guard has to come BEFORE the confirm, or a second click
          re-prompts while the first delete is still in flight. */}
      <button
        type="button"
        aria-label={`Supprimer ${event.title}`}
        aria-disabled={destroy.isPending}
        onClick={() => {
          if (destroy.isPending) return;
          if (window.confirm("Êtes-vous sûr de vouloir supprimer cet événement?")) {
            destroy.mutate({ id: event.id });
          }
        }}
        className="flex flex-1 items-center gap-1 rounded border border-line bg-panel px-2 py-1 text-sm text-ink hover:border-violet hover:text-violet aria-disabled:cursor-not-allowed aria-disabled:opacity-50 sm:flex-none"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Supprimer
      </button>
    </>
  );
}
