import { Tbd } from "../components/Tbd";

/**
 * One entry per register, in the old page's order.
 *
 * A data array rather than seven copies of the same markup: the sections differ
 * only in their photograph and their roster, and seven hand-written copies is
 * exactly where a caption ends up under the wrong picture.
 *
 * `roster` used to be `rosters`, a LIST, because the trumpets were photographed
 * in two rows and the old page captioned each row separately. With the names
 * replaced by a single placeholder there is nothing left to split, so it is one
 * optional string. Restore the list if per-row captions come back.
 *
 * THE NAMES ARE GONE ON
 * PURPOSE: the 2026-08-31 content audit asked whether the twenty-eight names
 * across these seven registers were current, and the answer was "don't know yet
 * — replace all names with placeholders so I know exactly what to update
 * later". A youth band turns over every year, and this is the page a parent
 * checks for their own child, so a stale roster is worse than a visible gap.
 *
 * The REGISTERS themselves are structural and stay, as does each register's own
 * photograph — the pairing of caption to picture is what the test below guards.
 *
 * The direction musicale keeps real names because the audit settled that one:
 * the band confirmed the handover in /historique had happened, so it is Lilou
 * Keller and Anaïs Meuwly, not the Laura and Delphine this page used to name.
 * Note Lilou was ALSO listed here as a cloche player; that entry went with the
 * rest of the roster.
 */
const REGISTERS: { heading: string; image: string; alt: string; roster?: string }[] = [
  {
    heading: "La Direction Musicale",
    image: "directionmusicale.jpg",
    alt: "La direction musicale des Canetons",
    roster: "Lilou et Anaïs",
  },
  {
    heading: "Nos Batteurs",
    image: "batteurs.jpg",
    alt: "Les batteurs des Canetons",
  },
  {
    heading: "Nos Grosses-Caisses",
    image: "grossescaisses.jpg",
    alt: "Les grosses caisses des Canetons",
  },
  {
    heading: "Notre Lyre",
    image: "lyre.jpg",
    alt: "La lyre des Canetons",
  },
  {
    heading: "Nos Cloches",
    image: "cloches.jpg",
    alt: "Les cloches des Canetons",
  },
  {
    heading: "Nos Trompettes",
    image: "trompettes.jpg",
    alt: "Les trompettes des Canetons",
  },
  {
    heading: "Nos Trombones",
    image: "trombones.jpg",
    alt: "Les trombones des Canetons",
  },
];

export function Canetons() {
  return (
    <section className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-4xl">Nos Canetons</h1>
      <img
        src="/assets/img/canetons.jpg"
        alt="Les Canetons au complet, en costume fluorescent, de nuit sur un pont de Fribourg"
        className="mt-6 rounded-lg"
      />

      <div className="mt-10 space-y-10">
        {REGISTERS.map((register) => (
          <article key={register.heading}>
            <h2 className="font-display text-2xl">{register.heading}</h2>
            {/* Lazy below the fold — every one of these is a photograph, and
                all seven eagerly is the whole page's weight at once. */}
            <img
              src={`/assets/img/${register.image}`}
              alt={register.alt}
              loading="lazy"
              className="mt-3 rounded-lg"
            />
            <p className="mt-2 text-ink-muted">
              {register.roster ?? <Tbd what="prénoms du registre" />}
            </p>
          </article>
        ))}
      </div>

      {/* Moved here from /comite_teamdirection on 2026-08-31 at the band's
          request. The names are confirmed current, so no placeholder. It sits
          on this page rather than the committee one because a parrain and a
          marraine are not committee officers — they belong with the people of
          the band. */}
      <h2 className="mt-12 font-display text-2xl">Le parrain et la marraine</h2>
      <img
        src="/assets/img/parrainmarraine.jpg"
        alt="Le parrain et la marraine des Canetons"
        loading="lazy"
        className="mt-3 rounded-lg"
      />
      <p className="mt-2 text-ink-muted">Richard Hertig et Annick Bürgisser</p>
    </section>
  );
}
