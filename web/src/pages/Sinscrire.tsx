import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";

import { getEventIndexQueryKey, useEventIndex, useResponseStore } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError } from "../components/FormField";
import { formatTime } from "../lib/date";
import { useSession } from "../session/SessionProvider";
import { ButtonLink } from "@/components/ButtonLink";
import { EventCard } from "@/components/EventCard";
import { PageSection } from "@/components/PageSection";
import { Button } from "@/components/ui/button";

/**
 * The two answers, for one event.
 *
 * ONE TAP COMMITS. The old flow was four interactions — tap S'inscrire, land on
 * a second page, open a <select> (an OS wheel picker on a phone), pick, tap
 * Confirmer — for a yes/no question, on a screen someone reads outdoors while
 * deciding whether they play on Saturday.
 *
 * That is only safe because the answer stays CHANGEABLE. The API has always
 * upserted on (user_id, event_id); it was the UI that made a mistap permanent
 * with a disabled "Choix enregistré" button. So a mistap here self-corrects.
 *
 * Its own component, and its own state, because pending and error belong to one
 * card. Hoisted to the page they would grey out every card while one saves.
 */
function AnswerControls({ eventId, answer }: { eventId: number; answer: string | null }) {
  const queryClient = useQueryClient();
  const [changing, setChanging] = useState(false);
  const { error, setFromThrown, clear } = useApiFormError(
    "L’inscription a échoué. Veuillez réessayer.",
  );

  const respond = useResponseStore({
    mutation: {
      onSuccess: async () => {
        setChanging(false);
        toast.success("Votre réponse est enregistrée.");
        await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      },
      onError: setFromThrown,
    },
  });

  const send = (participation: "participate" | "notparticipate") => {
    if (respond.isPending) return;
    clear();
    respond.mutate({ data: { eventId, participation } });
  };

  if (answer && !changing) {
    return (
      <>
        <p className="font-semibold text-violet">
          {answer === "participate" ? "Je participe" : "Je ne participe pas"}
        </p>
        <Button type="button" variant="outline" onClick={() => setChanging(true)}>
          Modifier
        </Button>
      </>
    );
  }

  return (
    <>
      {/* w-full so the error takes its own line: this renders into
          EventCard's `actions` row, which is a flex container, and a bare
          FormError would sit beside a button instead of above both. */}
      <div className="w-full">
        <FormError error={error} />
      </div>
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
    </>
  );
}

/**
 * The events a member answers.
 *
 * The action row is the whole point, and it is where the capability matrix
 * stops being intuitive: `respond` belongs to user and moderator, `view_summary`
 * to admin, and they do NOT overlap. So a member gets the two answers and an
 * admin gets "Résumé" — different controls on the same card, not one control
 * with different permissions.
 *
 * No client-side sort: the API orders by date, as /planning_repet established,
 * and since E1a it returns only upcoming events so nothing here has to filter
 * either. A test pins the order so a change there fails in the suite rather
 * than being papered over here.
 */
export function Sinscrire() {
  const { can } = useSession();
  const events = useEventIndex();

  if (events.isPending) {
    return (
      <PageSection width="text">
        <p>Chargement…</p>
      </PageSection>
    );
  }

  if (events.isError) {
    return (
      <PageSection width="text">
        <p role="alert">Les événements n’ont pas pu être chargés. Veuillez réessayer.</p>
      </PageSection>
    );
  }

  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Événements à venir</h1>

      <ul aria-label="Événements à venir" className="mt-6 space-y-4">
        {events.data.data.map((event) => (
          <EventCard
            key={event.id}
            event={event}
            actions={
              <>
                {can("respond") ? (
                  <AnswerControls eventId={event.id} answer={event.response} />
                ) : null}
                {can("view_summary") ? (
                  <ButtonLink to={`/inscriptions_admin?id=${event.id}`} variant="outline">
                    Résumé
                  </ButtonLink>
                ) : null}
              </>
            }
          >
            <p>
              {formatTime(event.startTime)} – {formatTime(event.endTime)}
              <span aria-hidden="true"> · </span>
              {event.location}
            </p>
          </EventCard>
        ))}
      </ul>
    </PageSection>
  );
}
