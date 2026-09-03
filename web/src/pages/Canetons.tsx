import { PhotoPending } from "../components/PhotoPending";
import { Tbd } from "../components/Tbd";
import { PageSection } from "@/components/PageSection";
import { RegisterIndex } from "@/components/RegisterIndex";
import { Card } from "@/components/ui/card";

/**
 * One entry per register, in the old page's order.
 *
 * A data array rather than seven copies of the same markup: seven hand-written
 * copies is exactly where a label ends up under the wrong register.
 *
 * EVERY PHOTOGRAPH IS GONE as of 2026-08-31 — the band's instruction was to
 * assume all of them are out of date, so each register shows a <PhotoPending />
 * naming what is awaited. `photo` completes that sentence.
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
 *
 * `id` anchors the register index above the list, and is ENGLISH because
 * CLAUDE.md puts identifiers and slugs in English — the French on this page is
 * the heading and the index's own label, both of which are read. `short` is
 * that label: "Grosses-caisses", not "Nos Grosses-Caisses", because seven full
 * headings do not fit on one row at 390px. Renaming an `id` without renaming
 * the link breaks a jump link silently; Canetons.test.tsx asserts the pairing.
 */
const REGISTERS: {
  id: string;
  short: string;
  heading: string;
  photo: string;
  roster?: string;
}[] = [
  {
    id: "direction",
    short: "Direction",
    heading: "La Direction Musicale",
    photo: "de la direction musicale",
    roster: "Lilou et Anaïs",
  },
  { id: "drums", short: "Batteurs", heading: "Nos Batteurs", photo: "des batteurs" },
  {
    id: "bass-drums",
    short: "Grosses-caisses",
    heading: "Nos Grosses-Caisses",
    photo: "des grosses-caisses",
  },
  { id: "lyre", short: "Lyre", heading: "Notre Lyre", photo: "de la lyre" },
  { id: "bells", short: "Cloches", heading: "Nos Cloches", photo: "des cloches" },
  { id: "trumpets", short: "Trompettes", heading: "Nos Trompettes", photo: "des trompettes" },
  { id: "trombones", short: "Trombones", heading: "Nos Trombones", photo: "des trombones" },
];

export function Canetons() {
  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Nos Canetons</h1>
      <PhotoPending what="des Canetons au complet" />
      <RegisterIndex entries={REGISTERS.map(({ id, short }) => ({ id, label: short }))} />

      <div className="mt-10 space-y-10">
        {REGISTERS.map((register) => (
          // scroll-mt so a jumped-to heading is not flush against the top of
          // the viewport. NOT an offset for a sticky header — this site's
          // header scrolls away with the page.
          <article key={register.id} id={register.id} className="scroll-mt-6">
            <h2 className="font-display text-2xl">{register.heading}</h2>
            <PhotoPending what={register.photo} />
            <p className="mt-2 text-ink-muted">
              {register.roster ?? <Tbd what="prénoms du registre" />}
            </p>
          </article>
        ))}
      </div>

      {/* SET APART FROM THE REGISTERS ON PURPOSE.
          Moved here from /comite_teamdirection on 2026-08-31, then separated
          from the register list the same day: the band pointed out that a
          parrain and a marraine are not an active part of the Canetons. Listing
          them in the same flow as the batteurs and the trompettes implies they
          play, which they do not.

          So it sits after a rule, in its own panel, outside the registers'
          container. The separation is structural rather than a sentence on the
          page — inventing copy about what a parrain does is not this change's
          business.

          Their photograph is the ORIGINAL, not a placeholder. Every other photo
          went on the assumption it was out of date, but that reasoning is about
          a roster that turns over yearly; two people who are not in the band
          do not go stale the same way, and the band asked for the old image
          back. */}
      <hr className="mt-12 border-line" />

      <Card className="mt-8 gap-0 p-5">
        <h2 className="font-display text-2xl">Le parrain et la marraine</h2>
        <img
          src="/assets/img/parrainmarraine.jpg"
          alt="Le parrain et la marraine des Canetons"
          loading="lazy"
          className="mt-4 rounded-lg"
        />
        <p className="mt-2 text-ink-muted">Richard Hertig et Annick Bürgisser</p>
      </Card>
    </PageSection>
  );
}
