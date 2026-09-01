import { Tbd } from "../components/Tbd";
import { PageSection } from "@/components/PageSection";

/**
 * NOTE 2026-08-31: this page no longer carries a photograph or the direction
 * musicale. The duckling stock photo under "Le comité" was dropped at the band's
 * request, and the direction musicale moved off this page entirely — /canetons
 * names Lilou and Anaïs, and /historique tells the handover story. One page owns
 * that fact now instead of three disagreeing about it.
 */

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

export function ComiteTeamDirection() {
  return (
    <PageSection>
      <h1 className="font-display text-4xl">Le comité</h1>

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
    </PageSection>
  );
}
