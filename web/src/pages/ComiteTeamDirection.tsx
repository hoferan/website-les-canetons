/**
 * The committee, in the order the old page listed it — which is by office, not
 * alphabetical, and is how the band reads it.
 *
 * One member publishes a phone number and the rest do not. That asymmetry is
 * the old page's and is deliberate: it is the number for booking the band.
 */
const COMMITTEE: { role: string; name: string; phone?: string }[] = [
  { role: "Présidente", name: "Delphine Maillard" },
  { role: "Vice-présidente - secrétaire", name: "Amanda Portmann" },
  { role: "Responsable prestations", name: "Céline Cuennet", phone: "079 322 12 57" },
  { role: "Responsable caisse", name: "Marc Rossier" },
  { role: "Responsable intendance", name: "Tiago Garces Cardoso" },
  { role: "Responsable costumes", name: "Martine Jutzet" },
  { role: "Responsable Team Direction", name: "Laura Mantel" },
  { role: "Membre", name: "Patrice Bersier" },
];

/**
 * Note: this page lists Laura Mantel and Delphine Maillard as the direction
 * musicale, while Historique.tsx says they handed over to Lilou Keller and
 * Anaïs Meuwly. The live site contradicts itself and the port reproduces both —
 * which is current is a content question for the band. See
 * docs/continue-here.md.
 */
export function ComiteTeamDirection() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-4xl">Le comité</h1>

      {/* The file is called comite.jpg and sits under "Le comité", but it is a
          stock photograph of actual ducklings, not of the committee. The alt
          text says what is there rather than what the filename claims: telling
          a screen-reader user there is a photo of the committee when there is
          not is worse than the old alt="Le comité" was. Flagged as a content
          question in docs/continue-here.md. */}
      <img
        src="/assets/img/comite.jpg"
        alt="Des canetons alignés sur un tronc d’arbre"
        className="mt-6 rounded-lg"
      />

      <div className="mt-6 rounded-lg border border-line bg-panel p-5">
        <h2 className="font-display text-xl">Contact des Canetons</h2>
        <p className="mt-2">
          <a href="mailto:comite@lescanetons.org" className="text-violet hover:underline">
            comite@lescanetons.org
          </a>
        </p>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COMMITTEE.map((member) => (
          <li key={member.role} className="rounded-lg border border-line bg-panel p-4">
            <p className="text-xs font-semibold tracking-wide text-violet uppercase">
              {member.role}
            </p>
            <p className="mt-1">{member.name}</p>
            {member.phone ? (
              <p className="mt-1">
                <a
                  href={`tel:+41${member.phone.replace(/\s/g, "").slice(1)}`}
                  className="text-violet hover:underline"
                >
                  {member.phone}
                </a>
              </p>
            ) : null}
          </li>
        ))}
      </ul>

      <h2 className="mt-12 font-display text-2xl">Direction musicale</h2>
      <img
        src="/assets/img/directionmusicale.jpg"
        alt="La direction musicale des Canetons"
        loading="lazy"
        className="mt-3 rounded-lg"
      />
      <p className="mt-2 text-ink-muted">Laura Mantel et Delphine Maillard</p>

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
