import { SouperCta } from "../components/SouperCta";

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
    <section className="mx-auto max-w-3xl px-4 py-8">
      <SouperCta />

      <h1 className="font-display text-4xl">Bienvenue sur notre site</h1>
      <img
        src="/assets/img/Cindyphotography-128.jpg"
        alt="Les Canetons en concert, costumes fluorescents sous la lumière noire"
        className="mt-6 rounded-lg"
      />
    </section>
  );
}
