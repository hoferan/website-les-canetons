/** Instructor per register, in the old page's order. */
const INSTRUCTORS: { register: string; names: string }[] = [
  { register: "Batterie", names: "Fabio, Théo, Nolan, Kevin" },
  { register: "Grosse caisse", names: "Kevin, Marc-Jérome" },
  { register: "Cloche", names: "Clémence, Baptiste" },
  { register: "Lyre", names: "Elodie" },
  { register: "Trompette", names: "Amanda, Anthony, Adeline" },
  { register: "Trombone", names: "Jessaline, Cassandra" },
];

export function Moniteurs() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">Nos Moniteurs</h1>
      <img
        src="/assets/img/moniteurs.jpg"
        alt="Les moniteurs des Canetons"
        className="mt-6 rounded-lg"
      />

      <p className="mt-8 font-display text-3xl text-violet">MERCI</p>
      <p className="mt-1 max-w-prose">
        à tous les moniteurs et toutes les personnes qui donnent de leur temps pour nos canetons
      </p>

      <ul className="mt-6 space-y-1 rounded-lg border border-line bg-panel p-5">
        {INSTRUCTORS.map((instructor) => (
          <li key={instructor.register}>
            <strong className="font-semibold text-ink-muted">{instructor.register}&nbsp;:</strong>{" "}
            {instructor.names}
          </li>
        ))}
      </ul>

      {/* The old page ended with a bare list of names under class "absentes" —
          those photographed absent. Kept, with the label the class implied but
          the markup never showed. */}
      <p className="mt-4 text-sm text-ink-muted">
        Absent·es de la photo&nbsp;: Cassandra, Adeline, Fabio, Théo, Elodie, Baptiste, Nolan,
        Kevin, Marc-Jérome
      </p>
    </section>
  );
}
