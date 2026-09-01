import { useEventIndex } from "../api/generated/endpoints";
import { formatTime } from "../lib/date";
import { useSession } from "../session/SessionProvider";
import { AnswerControls } from "./AnswerControls";
import { ButtonLink } from "@/components/ButtonLink";
import { EventCard } from "@/components/EventCard";
import { PageSection } from "@/components/PageSection";

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
