import { Link } from "react-router-dom";

import { PageSection } from "@/components/PageSection";
import { Tbd } from "@/components/Tbd";
import { Card } from "@/components/ui/card";

/** The information blocks, in the legacy page's order. */
const FACTS: { heading: string; lines: string[] }[] = [
  {
    heading: "Instruments recherchés",
    lines: ["Trompette", "Trombone", "Sousaphone", "Euphonium"],
  },
  { heading: "Horaires", lines: ["Les samedis matin", "De 10h à 12h"] },
  { heading: "Critères d’âge", lines: ["Dès 7 ans dans l’année civile jusqu’à l’âge de 18 ans"] },
];

/**
 * THE JOINING CONTACTS ARE PLACEHOLDERS ON PURPOSE.
 *
 * The legacy page published two names with mobile numbers. Both were the pair
 * that /history says have handed the direction musicale over, and when the
 * content audit asked whether the numbers were still right the answer was that
 * since the direction changed "the phone numbers might be out of date as well
 * — just replace them with placeholders".
 *
 * There is deliberately NO tel: link on a placeholder. A clickable number that
 * is wrong dials a stranger; a parent who sees a gap writes to the committee
 * instead, which is the fallback offered below.
 *
 * These are not generated from the roster, unlike /band and /committee. A
 * member row carries no phone number — the schema has never had one — and
 * "who to ring about joining" is not a committee title either. When the band
 * answers the audit, the two names land here as prose.
 */
const JOINING_CONTACTS = 2;

/**
 * A PLACE link, not a directions link.
 *
 * This used to be a maps/dir/ URL whose origin was a hardcoded coordinate pair
 * west of Fribourg, so every parent who clicked "Werkhof" was routed from a
 * spot that had nothing to do with where they were. Found by the 2026-08-31
 * content audit. A place query lets Google use the visitor's own location if
 * they ask for directions from here.
 */
const WERKHOF_MAP =
  "https://www.google.com/maps/search/?api=1&query=" +
  encodeURIComponent("Association Werkhof, Planche-Inférieure 14, 1700 Fribourg");

/**
 * How to join — the page a parent or a curious child lands on.
 *
 * NO TUTOIEMENT ANYWHERE ELSE ON THE PUBLIC SITE, but this heading keeps it:
 * it is the legacy page's own line and it addresses the child directly, which
 * is who it is for. The home page stays impersonal because it is read by both.
 */
export function Join() {
  return (
    <PageSection>
      <h1 className="font-display text-4xl">Tu veux commencer la guggen&nbsp;?</h1>
      <p className="mt-related max-w-prose">
        Nous sommes constamment à la recherche de quelques souffleurs pour s’époumonner et faire
        &laquo;&nbsp;concurrence&nbsp;&raquo; à nos percussions&nbsp;!
      </p>

      <div className="mt-block grid gap-4 sm:grid-cols-2">
        {FACTS.map((fact) => (
          <Card key={fact.heading} className="gap-0 p-5">
            <h2 className="font-display text-xl">{fact.heading}</h2>
            {fact.lines.map((line) => (
              <p key={line} className="mt-tight">
                {line}
              </p>
            ))}
          </Card>
        ))}

        <Card className="gap-0 p-5">
          <h2 className="font-display text-xl">Lieu</h2>
          <p className="mt-tight">
            <a
              href={WERKHOF_MAP}
              target="_blank"
              rel="noreferrer"
              className="text-violet hover:underline"
            >
              Werkhof
            </a>
          </p>
          <p>Basse-Ville de Fribourg</p>
        </Card>

        <Card className="gap-0 p-5">
          <h2 className="font-display text-xl">Contacts</h2>
          {Array.from({ length: JOINING_CONTACTS }, (_, index) => (
            <p key={index} className="mt-tight">
              <Tbd what="nom et numéro" />
            </p>
          ))}
          <p className="mt-related text-sm text-ink-muted">
            En attendant, écrivez-nous depuis la{" "}
            <Link to="/contact" className="text-violet hover:underline">
              page de contact
            </Link>
            .
          </p>
        </Card>
      </div>
    </PageSection>
  );
}
