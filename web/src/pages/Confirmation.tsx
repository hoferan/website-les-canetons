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
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h2 className="text-2xl font-bold">Formulaire envoyé avec succès !</h2>
      <p className="mt-4">
        Merci d’avoir rempli le formulaire. Vous recevrez bientôt un e-mail de confirmation.
      </p>
    </section>
  );
}
