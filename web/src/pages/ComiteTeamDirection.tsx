import { Tbd } from "../components/Tbd";

/**
 * The committee, by office rather than alphabetically — the order the band
 * reads it in, kept from the old page.
 *
 * THE NAMES ARE GONE ON PURPOSE. The 2026-08-31 content audit asked whether the
 * eight-member list was current and the answer was "don't know yet — replace
 * all names with placeholders so I know exactly what to update later". The
 * OFFICES are structural and stay; the names are the part nobody could vouch
 * for. Fill each one in and delete its <Tbd />.
 *
 * The phone number that used to sit against "Responsable prestations" is gone
 * for the same reason, and one further one: the direction musicale changed (see
 * below), so the audit's answer was that the published numbers "might be out of
 * date as well". A wrong number on a booking page sends a caller to a stranger,
 * which is worse than no number at all.
 */
const COMMITTEE: { role: string }[] = [
  { role: "Présidente" },
  { role: "Vice-présidente - secrétaire" },
  { role: "Responsable prestations" },
  { role: "Responsable caisse" },
  { role: "Responsable intendance" },
  { role: "Responsable costumes" },
  { role: "Responsable Team Direction" },
  { role: "Membre" },
];

/**
 * The direction musicale, corrected on 2026-08-31.
 *
 * The site used to contradict itself in three places: /historique said the
 * direction had passed to Lilou Keller and Anaïs Meuwly, while this page and
 * /canetons both still named Laura Mantel and Delphine Maillard. The band
 * confirmed Historique was right, so these are the current names and the other
 * two pages were the stale ones.
 *
 * The photograph that used to sit here has been removed rather than updated:
 * it is the outgoing pair, and /canetons already carries a direction musicale
 * photograph. Showing the same picture on two pages was one of the redundancies
 * the audit flagged, and the audit's answer was to remove it here.
 */
const DIRECTION = "Lilou Keller et Anaïs Meuwly";

export function ComiteTeamDirection() {
  return (
    <section className="mx-auto max-w-5xl px-4 py-8">
      <h1 className="font-display text-4xl">Le comité</h1>

      {/* The file is called comite.jpg and sits under "Le comité", but it is a
          stock photograph of actual ducklings, not of the committee. The alt
          text says what is there rather than what the filename claims: telling
          a screen-reader user there is a photo of the committee when there is
          not is worse than the old alt="Le comité" was. The band was asked and
          is content to keep it for now. */}
      <img
        src="/assets/img/comite.jpg"
        alt="Des canetons alignés sur un tronc d’arbre"
        className="mt-6 rounded-lg"
      />

      {/* One contact block, not two. The audit flagged the address appearing on
          several pages; repeating it twice on this one would be worse. The
          booking number lives here beside it rather than against a committee
          office, because it is the number for reserving the band. */}
      <div className="mt-6 rounded-lg border border-line bg-panel p-5">
        <h2 className="font-display text-xl">Contact des Canetons</h2>
        <p className="mt-2">
          <a href="mailto:comite@lescanetons.org" className="text-violet hover:underline">
            comite@lescanetons.org
          </a>
        </p>
        <p className="mt-2">
          Pour réserver les Canetons : <Tbd what="numéro pour les prestations" />
        </p>
      </div>

      <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {COMMITTEE.map((member) => (
          <li key={member.role} className="rounded-lg border border-line bg-panel p-4">
            <p className="text-xs font-semibold tracking-wide text-violet uppercase">
              {member.role}
            </p>
            <p className="mt-1">
              <Tbd what="nom" />
            </p>
          </li>
        ))}
      </ul>

      <h2 className="mt-12 font-display text-2xl">Direction musicale</h2>
      <p className="mt-2 text-ink-muted">{DIRECTION}</p>
    </section>
  );
}
