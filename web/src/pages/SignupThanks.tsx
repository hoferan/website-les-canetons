import { Link } from "react-router-dom";

import { useSession } from "../session/SessionProvider";

/**
 * Where the signup form lands on success.
 *
 * ALWAYS REACHABLE, with no navigation-state gate — the same decision
 * /confirmation embodies for the contact form: its own URL rather than an
 * inline success state, because that is what app/pages/signup_thanks.php was
 * and the path is in the wild. Gating it would also break a refresh.
 *
 * The route itself only exists while the souper feature is on, so `occasion` is
 * non-null whenever this renders; the fallback below narrows the type rather
 * than asserting past it.
 */
export function SignupThanks() {
  const { config } = useSession();
  const occasion = config.occasion;

  return (
    <section className="mx-auto max-w-2xl px-4 py-8 text-center">
      <p className="text-5xl" aria-hidden="true">
        🎉🦆
      </p>
      <h1 className="mt-4 font-display text-3xl">Merci pour votre inscription !</h1>

      <p className="mt-6">
        Votre inscription au <strong>{occasion?.title}</strong> a bien été enregistrée.
      </p>
      <p className="mt-3 text-ink-muted">
        Un e-mail de confirmation vient de vous être envoyé, avec le récapitulatif de votre
        réservation. Pensez à vérifier vos courriers indésirables si vous ne le trouvez pas.
      </p>
      <p className="mt-6">
        Rendez-vous le <strong>{occasion?.dateDisplay}</strong> !
      </p>

      <p className="mt-8">
        <Link
          to="/"
          className="inline-block rounded bg-violet px-4 py-2 font-semibold text-white hover:bg-violet/90"
        >
          Retour à l’accueil
        </Link>
      </p>
    </section>
  );
}
