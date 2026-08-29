/**
 * Every route that exists but has not been ported yet.
 *
 * Deliberately visible rather than blank: navigation is complete from day one,
 * and what is still missing is obvious to anyone clicking around — including
 * the band, who can say which pages matter most.
 */
export function Placeholder({ title }: { title: string }) {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-3xl">{title}</h1>
      <p className="mt-4 text-gray-600">Cette page n’a pas encore été reprise.</p>
    </section>
  );
}
