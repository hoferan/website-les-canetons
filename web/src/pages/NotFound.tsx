import { PageSection } from "@/components/PageSection";
import { ButtonLink } from "@/components/ButtonLink";

/**
 * A SOFT 404: the server answered 200 with the shell, because the .htaccess
 * fallback is a catch-all by design (see config/htaccess/site.htaccess), and
 * this is what the visitor sees. Same visible page as before the cutover,
 * different HTTP status — accepted deliberately, since the alternative is
 * enumerating every route in .htaccess where it would drift from the router.
 */
export function NotFound() {
  return (
    <PageSection width="text" className="py-16 text-center">
      <p className="font-display text-7xl text-danger">404</p>
      <h1 className="mt-related font-display text-3xl">Page introuvable</h1>
      <p className="mt-related text-gray-600">
        Oups&nbsp;! La page que vous recherchez n’existe pas ou a été déplacée.
      </p>
      {/* A ButtonLink rather than an underlined text link: this is the page's
          only way out and the one control on it, so it belongs above the 44px
          floor. It measured 24px. Inline links inside prose are a different
          case and stay as they are. */}
      <ButtonLink to="/" variant="outline" className="mt-block">
        Retour à l’accueil
      </ButtonLink>
    </PageSection>
  );
}
