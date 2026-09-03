import { PhotoPending } from "../components/PhotoPending";
import { SouperCta } from "../components/SouperCta";
import { PageSection } from "@/components/PageSection";
import { BrandLogo } from "@/components/Logo";

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

      {/* The band's badge, at a size where it reads — the mark people know from
          the flyers, the costumes and the instruments. It sits here because the
          header now carries the duck alone; see Logo.tsx.

          DELIBERATELY MODEST. /accueil is E2b's subject and that spec is already
          written: it turns this page into a real front door with a hero built
          from facts /historique already publishes. This is a placement, not that
          hero — E2b should be free to rework the page around it.

          It is DELIBERATELY BIGGER THAN THE FOOTER'S (w-64 against w-28). Both
          were w-40-ish at first and, on a page this short, the badge appeared
          twice at the same size within one screen and read as a duplication
          bug. Size is what makes one the page's mark and the other a sign-off;
          if either changes, keep the gap. */}
      <BrandLogo className="mx-auto mt-6 w-64" />

      <PhotoPending what="des Canetons en concert" />
    </PageSection>
  );
}
