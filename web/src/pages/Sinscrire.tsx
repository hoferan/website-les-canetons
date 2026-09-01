import { Link } from "react-router-dom";

import { useEventIndex } from "../api/generated/endpoints";
import { formatEventDate } from "../lib/date";
import { useSession } from "../session/SessionProvider";
import { PageSection } from "@/components/PageSection";

/**
 * The events a member answers.
 *
 * The action cell is the whole point, and it is where the capability matrix
 * stops being intuitive: `respond` belongs to user and moderator, `view_summary`
 * to admin, and they do NOT overlap. So a member gets "S'inscrire" and an admin
 * gets "Résumé" — different buttons on the same row, not one button with
 * different permissions.
 *
 * No client-side sort: the API orders by date, as /planning_repet established.
 * A test pins the order so a change there fails in the suite rather than being
 * papered over here.
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

      <div className="mt-6 overflow-x-auto rounded-lg border border-line bg-panel">
        <table className="w-full text-left" aria-label="Événements à venir">
          <thead>
            <tr className="border-b border-line">
              <th className="p-3 font-semibold text-ink-muted">Date</th>
              <th className="p-3 font-semibold text-ink-muted">Titre</th>
              <th className="p-3 font-semibold text-ink-muted">Inscription</th>
            </tr>
          </thead>
          <tbody>
            {events.data.data.map((event) => (
              <tr key={event.id} className="border-b border-line last:border-0">
                <td className="p-3">{formatEventDate(event.date)}</td>
                <td className="p-3">{event.title}</td>
                <td className="p-3">
                  {can("respond") ? (
                    event.response ? (
                      <button
                        type="button"
                        disabled
                        className="rounded border border-line px-3 py-1 text-sm text-ink-muted"
                      >
                        Choix enregistré
                      </button>
                    ) : (
                      <Link
                        to={`/inscriptions_utilisateurs?id=${event.id}`}
                        className="inline-block rounded bg-violet px-3 py-1 text-sm font-semibold text-white hover:bg-violet/90"
                      >
                        S’inscrire
                      </Link>
                    )
                  ) : null}

                  {can("view_summary") ? (
                    <Link
                      to={`/inscriptions_admin?id=${event.id}`}
                      className="inline-block rounded border border-line px-3 py-1 text-sm hover:border-violet hover:text-violet"
                    >
                      Résumé
                    </Link>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PageSection>
  );
}
