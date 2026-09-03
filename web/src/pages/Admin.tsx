import { DestinationCards, type Destination } from "../components/DestinationCards";
import { PageSection } from "@/components/PageSection";

/**
 * The admin has exactly one destination from here: the events page.
 *
 * The card grid moved into DestinationCards on 2026-09-03, when /accueil grew
 * four of them: this page's tree and that one's were identical, and the rule
 * this codebase already follows (see EventCard) is that a second
 * near-identical card tree is one you keep in step forever.
 */
const DESTINATIONS: Destination[] = [
  {
    to: "/planning_repet",
    title: "Événements",
    description: "Ajouter, modifier ou supprimer un événement, et lire les réponses des membres.",
  },
];

/**
 * The admin's landing page.
 *
 * The old page was two buttons: "Ajouter un événement", linking to
 * /planning_repet?admin=true, and "Se déconnecter". Both are redundant now —
 * the planning page shows admins the event form automatically, and logout lives
 * on the login route. Rather than reproduce two controls that no longer do
 * anything distinct, this is the page they were trying to be.
 */
export function Admin() {
  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Administration</h1>

      <DestinationCards label="Administration" destinations={DESTINATIONS} />
    </PageSection>
  );
}
