import { useSession } from "../session/SessionProvider";
import { ButtonLink } from "@/components/ButtonLink";

/**
 * The home page's call to the souper.
 *
 * Rendered only when the feature is on AND the occasion copy is present —
 * ConfigController ties the two together, so the second check narrows the type
 * rather than guarding a state the API produces.
 *
 * The split is on `view_summary`, NOT on being logged in. The capability matrix
 * is not a hierarchy: `user` and `moderator` may respond to events but hold no
 * view_summary, so they see the public invitation, exactly as accueil.php did
 * with Auth::canViewSummary().
 *
 * Its own component so Accueil.tsx stays a page rather than a page plus a
 * feature.
 */
export function SouperCta() {
  const { config, can } = useSession();
  const occasion = config.occasion;

  if (!config.features.souper_signup || !occasion) return null;

  const summary = can("view_summary");

  return (
    <section className="mb-8 rounded-lg border border-line border-l-4 border-l-violet bg-panel p-6 text-center">
      <p className="text-4xl" aria-hidden="true">
        🦆🎉
      </p>
      <h2 className="mt-3 font-display text-2xl">{occasion.title}</h2>
      <p className="mt-1 text-ink-muted">{occasion.subtitle}</p>
      <p className="mt-2 font-semibold text-violet">{occasion.dateDisplay}</p>

      {summary ? (
        <p className="mt-4">Consultez les inscriptions : totaux par menu et par table.</p>
      ) : (
        <>
          <p className="mt-4">{occasion.teaser}</p>
          <p className="mt-2">{occasion.invitation}</p>
        </>
      )}

      <p className="mt-5">
        <ButtonLink to={summary ? "/signups_admin" : "/signup"}>
          {summary ? "Voir les inscriptions" : "S’inscrire au souper"}
        </ButtonLink>
      </p>
    </section>
  );
}
