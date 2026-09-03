import { Link } from "react-router-dom";

import { Card } from "@/components/ui/card";

export type Destination = { to: string; title: string; description: string };

/**
 * A short grid of link cards pointing somewhere else on the site.
 *
 * IT MUST NEVER BE GENERATED FROM `NAV`. On /accueil these four cards
 * deliberately duplicate four of the navigation's ten entries: the nav is the
 * list of every page and is the source of truth for what EXISTS, while this is
 * a curated shortlist of what a stranger most likely wants first. If the two
 * drift, the nav is right about existence and this is still right about
 * priority. Deriving one from the other collapses that distinction and turns
 * the front door back into a second navigation.
 *
 * The WHOLE CARD is the link, not a "read more" inside it: 44px is the floor
 * for every interactive control on this site, and a card-sized target is
 * easier still on a phone. The description sits inside the anchor so the
 * accessible name says where the link goes and why, rather than repeating the
 * nav's own label.
 *
 * `focus-ring` because the card has no other focus affordance — it is a <div>
 * turned into an <a>, and `focus-ring` is what this codebase uses in place of
 * the browser default everywhere else.
 *
 * `h-full` on both the card and the anchor: in a grid row, a two-line
 * description beside a one-line one otherwise leaves the shorter card floating
 * with a ragged bottom edge.
 */
export function DestinationCards({
  label,
  destinations,
}: {
  label: string;
  destinations: Destination[];
}) {
  return (
    <ul aria-label={label} className="mt-6 grid gap-3 sm:grid-cols-2">
      {destinations.map((destination) => (
        <li key={destination.to}>
          <Card asChild className="h-full gap-0 p-5 transition-colors hover:border-violet">
            <Link to={destination.to} className="focus-ring block h-full">
              <span className="font-display text-xl text-violet">{destination.title}</span>
              <span className="mt-1 block text-ink-muted">{destination.description}</span>
            </Link>
          </Card>
        </li>
      ))}
    </ul>
  );
}
