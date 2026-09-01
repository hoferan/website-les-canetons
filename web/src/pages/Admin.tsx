import { Link } from "react-router-dom";
import { PageSection } from "@/components/PageSection";
import { Card } from "@/components/ui/card";

/**
 * The admin's landing page.
 *
 * The old page was two buttons: "Ajouter un événement", linking to
 * /planning_repet?admin=true, and "Se déconnecter". Both are redundant now —
 * the planning page shows admins the event form automatically, and logout lives
 * on the login route. Rather than reproduce two controls that no longer do
 * anything distinct, this is the page they were trying to be.
 */
const DESTINATIONS: { to: string; title: string; description: string }[] = [
  {
    to: "/planning_repet",
    title: "Événements",
    description: "Ajouter, modifier ou supprimer un événement, et lire les réponses des membres.",
  },
];

export function Admin() {
  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Administration</h1>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2">
        {DESTINATIONS.map((destination) => (
          <li key={destination.to}>
            <Card asChild className="h-full gap-0 p-5 transition-colors hover:border-violet">
              <Link to={destination.to} className="block h-full">
                <span className="font-display text-xl text-violet">{destination.title}</span>
                <span className="mt-1 block text-ink-muted">{destination.description}</span>
              </Link>
            </Card>
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
