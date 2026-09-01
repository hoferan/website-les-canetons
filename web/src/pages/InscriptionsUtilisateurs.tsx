import { useNavigate, useSearchParams } from "react-router-dom";

import { useEventIndex, useResponseStore } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError } from "../components/FormField";
import { formatEventDate } from "../lib/date";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";

/**
 * Answer one event.
 *
 * The event comes from the list rather than a dedicated endpoint — there is no
 * GET /api/events/{id}, and the list is already cached by the time anyone
 * arrives here from /planning_repet.
 *
 * A DEEP-LINK FALLBACK now, not the main flow. /planning_repet answers inline in
 * one tap, so nothing links here any more — but the URL is frozen and is in
 * bookmarks, so it keeps working and offers the same two buttons.
 *
 * Note a link to a PAST event now falls through to the "Aucun événement à
 * confirmer" branch below, because GET /api/events returns upcoming events by
 * default and this page finds its event in that list. That is correct rather
 * than regrettable: answering an event that has happened is meaningless.
 *
 * It NAMES the event, which the old page did not: its heading was "Inscription
 * à l'événement" and nothing on screen said which one. That was a defect, and
 * the date and title cost nothing here.
 */
export function InscriptionsUtilisateurs() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { error, setFromThrown, clear } = useApiFormError(
    "L’inscription a échoué. Veuillez réessayer.",
  );

  const eventId = Number(params.get("id"));
  const events = useEventIndex();
  const event =
    Number.isInteger(eventId) && eventId > 0 && !events.isPending && !events.isError
      ? events.data.data.find((candidate) => candidate.id === eventId)
      : undefined;

  const respond = useResponseStore({
    mutation: {
      onSuccess: () => navigate("/planning_repet"),
      onError: setFromThrown,
    },
  });

  const send = (participation: "participate" | "notparticipate") => {
    if (respond.isPending || !event) return;
    clear();
    respond.mutate({ data: { eventId: event.id, participation } });
  };

  if (events.isPending) {
    return (
      <PageSection width="form">
        <p>Chargement…</p>
      </PageSection>
    );
  }

  // One message for "no id", "not a number" and "no such event": from the
  // member's side they are the same situation — the link they followed does not
  // point at an event any more.
  if (!event) {
    return (
      <PageSection width="form">
        <h1 className="font-display text-3xl">Inscription à l’événement</h1>
        <p role="alert" className="mt-4 text-danger">
          Aucun événement à confirmer. Retournez à la liste et choisissez-en un.
        </p>
      </PageSection>
    );
  }

  return (
    <PageSection width="form">
      <h1 className="font-display text-3xl">Inscription à l’événement</h1>
      <p className="mt-2 text-ink-muted">
        {formatEventDate(event.date)} — {event.title}
      </p>

      <FormError error={error} />

      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          type="button"
          aria-disabled={respond.isPending}
          onClick={() => send("participate")}
          className="flex-1 sm:flex-none"
        >
          Je participe
        </Button>
        <Button
          type="button"
          variant="outline"
          aria-disabled={respond.isPending}
          onClick={() => send("notparticipate")}
          className="flex-1 sm:flex-none"
        >
          Je ne participe pas
        </Button>
      </div>
    </PageSection>
  );
}
