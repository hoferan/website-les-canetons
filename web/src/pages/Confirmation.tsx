import { PageSection } from "@/components/PageSection";
import { Card } from "@/components/ui/card";

/**
 * Where the contact form lands on success.
 *
 * Its own URL rather than an inline success state, because that is what
 * app/pages/confirmation.php was and the path is in the wild. Nothing here is
 * dynamic: the old page was twelve lines of static markup and this is the same
 * twelve lines.
 */
export function Confirmation() {
  return (
    <PageSection width="text">
      <Card className="gap-0 border-l-4 border-l-violet p-6">
        <h1 className="font-display text-3xl">Formulaire envoyé avec succès !</h1>
        <p className="mt-related">
          Merci d’avoir rempli le formulaire. Vous recevrez bientôt un e-mail de confirmation.
        </p>
      </Card>
    </PageSection>
  );
}
