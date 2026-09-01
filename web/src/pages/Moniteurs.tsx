import { PhotoPending } from "../components/PhotoPending";
import { Tbd } from "../components/Tbd";
import { PageSection } from "@/components/PageSection";

/**
 * One entry per register.
 *
 * THE NAMES ARE GONE ON PURPOSE. The 2026-08-31 content audit asked whether the
 * seventeen instructors listed here were current, and the answer was "don't know
 * yet — replace all names with placeholders so I know exactly what to update
 * later". The REGISTERS are structural and stay.
 *
 * The old page also ended with a list of nine instructors marked absent from the
 * photograph — more than half of them. That list has gone with the rest of the
 * names, and the photograph it apologised for has gone too: the band said a new
 * one is worth taking. See the placeholder below.
 */
const REGISTERS: string[] = [
  "Batterie",
  "Grosse caisse",
  "Cloche",
  "Lyre",
  "Trompette",
  "Trombone",
];

export function Moniteurs() {
  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Nos Moniteurs</h1>

      <PhotoPending what="des moniteurs" />

      <p className="mt-8 font-display text-3xl text-violet">MERCI</p>
      <p className="mt-1 max-w-prose">
        à tous les moniteurs et toutes les personnes qui donnent de leur temps pour nos canetons
      </p>

      <ul className="mt-6 space-y-1 rounded-lg border border-line bg-panel p-5">
        {REGISTERS.map((register) => (
          <li key={register}>
            <strong className="font-semibold text-ink-muted">{register}&nbsp;:</strong>{" "}
            <Tbd what="prénoms des moniteurs" />
          </li>
        ))}
      </ul>
    </PageSection>
  );
}
