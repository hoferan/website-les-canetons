import { PhotoPending } from "../components/PhotoPending";
import { SouperCta } from "../components/SouperCta";
import { PageSection } from "@/components/PageSection";

/**
 * The home page.
 *
 * The souper call-to-action above the welcome is flag-gated and lives in its
 * own component — it was deferred through sub-projects A to C because its two
 * buttons link to /signup and /signups_admin, and a call-to-action that lands
 * on a placeholder is worse than none.
 */
export function Accueil() {
  return (
    <PageSection width="text">
      <SouperCta />

      <h1 className="font-display text-4xl">Bienvenue sur notre site</h1>
      <PhotoPending what="des Canetons en concert" />
    </PageSection>
  );
}
