import { Link } from "react-router-dom";

/**
 * A SOFT 404: the server answered 200 with the shell, because the .htaccess
 * fallback is a catch-all by design (see config/htaccess/site.htaccess), and
 * this is what the visitor sees. Same visible page as before the cutover,
 * different HTTP status — accepted deliberately, since the alternative is
 * enumerating every route in .htaccess where it would drift from the router.
 */
export function NotFound() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16 text-center">
      <p className="font-display text-7xl text-danger">404</p>
      <h1 className="mt-4 font-display text-3xl">Page introuvable</h1>
      <p className="mt-4 text-gray-600">
        Oups&nbsp;! La page que vous recherchez n’existe pas ou a été déplacée.
      </p>
      <Link to="/" className="mt-6 inline-block underline">
        Retour à l’accueil
      </Link>
    </section>
  );
}
