import { useQueryClient } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { getEventIndexQueryKey, useEventDestroy } from "../api/generated/endpoints";
import type { EditableEvent } from "./EventForm";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

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
      onError: () => toast.error("La suppression de l’événement a échoué. Veuillez réessayer."),
    },
  });

  const [confirming, setConfirming] = useState(false);

  return (
    // A fragment: EventCard's `actions` slot is already the flex footer row.
    <>
      <Button
        type="button"
        variant="outline"
        aria-label={`Modifier ${event.title}`}
        onClick={() => onEdit(event)}
        className="flex-1 sm:flex-none"
      >
        <Pencil aria-hidden="true" className="size-4" />
        Modifier
      </Button>
      {/* The dialog's own confirm button is ALSO labelled "Supprimer", so the
          trigger keeps the event title in its accessible name. That is what
          distinguishes the two in a query, and it is the same reason the title
          was in the label before there was a dialog. */}
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogTrigger asChild>
          <Button
            type="button"
            variant="outline"
            aria-label={`Supprimer ${event.title}`}
            aria-disabled={destroy.isPending}
            // The guard has to come BEFORE the dialog opens, or a second click
            // re-prompts over an in-flight delete. aria-disabled deliberately
            // does not block the click — disabling a focused control blurs it to
            // <body> — so this early return is the only thing that does.
            onClick={(clickEvent) => {
              if (destroy.isPending) clickEvent.preventDefault();
            }}
            className="flex-1 sm:flex-none"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Supprimer
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet événement&nbsp;?</AlertDialogTitle>
            <AlertDialogDescription>
              {event.title} sera définitivement supprimé du planning.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction onClick={() => destroy.mutate({ id: event.id })}>
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
