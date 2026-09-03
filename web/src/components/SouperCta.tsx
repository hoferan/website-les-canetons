import { useSession } from "../session/SessionProvider";
import { ButtonLink } from "@/components/ButtonLink";
import { Card } from "@/components/ui/card";

/**
 * The home page's call to the souper — a banner, not a card.
 *
 * IT WAS 458px, 54% OF AN 844px PHONE. The original shape was a centred card:
 * a 🦆🎉 display line, an <h2>, a subtitle, the date, a teaser, the invitation
 * and the button, each on its own line, `p-6 text-center`. Measured at
 * 390×844, that pushed the badge to y=639, the <h1> to y=804 and the hero's
 * supporting sentence to y=964 — all three below the fold, on the page whose
 * whole job is to say who the band is. THE SOUPER IS TEMPORARY — flag-gated
 * per server, describing one event in November 2027 — so the front page has
 * to read well both with and without it; a permanent identity buried under a
 * temporary announcement fails that in the "with" state. This is the fix:
 * title, date and one line beside the button, left-aligned, no taller than an
 * announcement needs to be.
 *
 * THE SUBTITLE AND THE TEASER ARE GONE ON PURPOSE, NOT LOST. Signup.tsx
 * already renders `occasion.title`, `subtitle`, `teaser` and `invitation` (see
 * near its top) — the detail lives one click away, on the page where you act
 * on it. A banner's job is to say what and when and get out of the way; it
 * does not owe you the whole pitch.
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
    <Card asChild className="mb-8 gap-0 border-l-4 border-l-violet p-4" data-souper-banner="">
      {/* Side by side above `sm`, stacked below it — that alone is most of
          what makes this a banner rather than the card it replaced. */}
      <section className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-display text-xl">
            <span aria-hidden="true">🦆</span> {occasion.title}
          </h2>
          <p className="mt-1 font-semibold text-violet">{occasion.dateDisplay}</p>
          <p className="mt-1 text-ink-muted">
            {summary
              ? "Consultez les inscriptions : totaux par menu et par table."
              : occasion.invitation}
          </p>
        </div>

        <p className="shrink-0">
          <ButtonLink to={summary ? "/signups_admin" : "/signup"}>
            {summary ? "Voir les inscriptions" : "S’inscrire au souper"}
          </ButtonLink>
        </p>
      </section>
    </Card>
  );
}
