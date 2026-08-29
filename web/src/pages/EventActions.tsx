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
    <div className="absolute top-2 right-2 flex gap-2">
      <button
        type="button"
        aria-label={`Modifier ${event.title}`}
        onClick={() => onEdit(event)}
        className="flex items-center gap-1 rounded border px-2 py-1 text-sm"
      >
        <Pencil aria-hidden="true" className="size-4" />
        Modifier
      </button>
      <button
        type="button"
        aria-label={`Supprimer ${event.title}`}
        disabled={destroy.isPending}
        onClick={() => {
          if (window.confirm("Êtes-vous sûr de vouloir supprimer cet événement?")) {
            destroy.mutate({ id: event.id });
          }
        }}
        className="flex items-center gap-1 rounded border px-2 py-1 text-sm"
      >
        <Trash2 aria-hidden="true" className="size-4" />
        Supprimer
      </button>
    </div>
  );
}
