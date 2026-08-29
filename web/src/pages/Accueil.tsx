/**
 * The home page — the STATIC half of the old accueil.php.
 *
 * The other half was a feature-flagged call-to-action for the souper, reading
 * the occasion copy that GET /api/config already publishes. It is deliberately
 * not here: its two buttons link to /signup and /signups_admin, which are still
 * Placeholder, and a call-to-action that lands on a placeholder is worse than
 * none. The souper sub-project builds the CTA and its destinations together.
 */
export function Accueil() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">Bienvenue sur notre site</h1>
      <img
        src="/assets/img/Cindyphotography-128.jpg"
        alt="Les Canetons en concert, costumes fluorescents sous la lumière noire"
        className="mt-6 rounded-lg"
      />
    </section>
  );
}
