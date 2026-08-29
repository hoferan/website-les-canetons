/**
 * One entry per register, in the old page's order.
 *
 * A data array rather than seven copies of the same markup: the sections differ
 * only in their photograph and their roster, and seven hand-written copies is
 * exactly where a caption ends up under the wrong picture.
 *
 * `rosters` is a list because the trumpets are photographed in two rows and the
 * old page captioned each separately.
 */
const REGISTERS: { heading: string; image: string; alt: string; rosters: string[] }[] = [
  {
    heading: "La Direction Musicale",
    image: "directionmusicale.jpg",
    alt: "La direction musicale des Canetons",
    rosters: ["Laura et Delphine"],
  },
  {
    heading: "Nos Batteurs",
    image: "batteurs.jpg",
    alt: "Les batteurs des Canetons",
    rosters: ["De gauche à droite : Nolan, Kevin, Arnaud, Gwenael"],
  },
  {
    heading: "Nos Grosses-Caisses",
    image: "grossescaisses.jpg",
    alt: "Les grosses caisses des Canetons",
    rosters: ["De gauche à droite : William, Kilian, Marc-Jérôme"],
  },
  {
    heading: "Notre Lyre",
    image: "lyre.jpg",
    alt: "La lyre des Canetons",
    rosters: ["Mäelle"],
  },
  {
    heading: "Nos Cloches",
    image: "cloches.jpg",
    alt: "Les cloches des Canetons",
    rosters: ["De gauche à droite : Lilou, Baptiste, Benjamin, Abigaëlle"],
  },
  {
    heading: "Nos Trompettes",
    image: "trompettes.jpg",
    alt: "Les trompettes des Canetons",
    rosters: [
      "Debout de gauche à droite : Naïma, Cléa E, Maeva, Eloïse, Coline, Gaëtan",
      "Devant de gauche à droite : Amandine, Nathaël, Leia, Nora",
    ],
  },
  {
    heading: "Nos Trombones",
    image: "trombones.jpg",
    alt: "Les trombones des Canetons",
    rosters: ["De gauche à droite : Sarah, Cléa F, Axel, Camille"],
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
            {register.rosters.map((roster) => (
              <p key={roster} className="mt-2 text-ink-muted">
                {roster}
              </p>
            ))}
          </article>
        ))}
      </div>
    </section>
  );
}
