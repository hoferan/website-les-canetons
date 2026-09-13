import { Link } from "react-router-dom";

import { PageSection } from "@/components/PageSection";
import { Tbd } from "@/components/Tbd";
import { Card } from "@/components/ui/card";

import { rowsOf } from "../api/collection";
import { useCommitteeIndex } from "../api/generated/endpoints";
import type { CommitteeMemberResource } from "../api/generated/model";

/**
 * The committee — who to write to, and who holds which seat.
 *
 * GENERATED FROM THE ROSTER, unlike the legacy page, which carried eight
 * hardcoded offices and eight placeholders where the names should have been.
 * A seat is now `committee_title` on a member row: the committee types it, the
 * committee changes it, and nobody has to ship a deploy to add a ninth.
 *
 * THE SEATS ARE IN NAME ORDER, and the API's own comment explains why rather
 * than this one — but the consequence is visible here: the legacy page read
 * présidente first, and this one does not, because nothing in the data says a
 * présidente outranks a caissière. A rank column would fix it. Nobody has
 * asked for one.
 *
 * THE EMAIL ADDRESS IS GONE. The 2026-08-31 audit flagged comite@lescanetons.org
 * appearing on page after page; this one now sends people to the contact form
 * instead, which stores the message for the committee and cannot be harvested.
 * The booking number stays a placeholder: a wrong number on a booking page
 * sends a caller to a stranger, which is worse than no number at all.
 */
export function Committee() {
  const committee = useCommitteeIndex();
  const seats = rowsOf<CommitteeMemberResource>(committee.data);

  return (
    <PageSection>
      <h1 className="font-display text-4xl">Le comité</h1>

      <Card className="mt-block gap-0 p-5">
        <h2 className="font-display text-xl">Contact des Canetons</h2>
        <p className="mt-tight">
          <Link to="/contact" className="text-violet hover:underline">
            Écrire au comité
          </Link>
        </p>
        <p className="mt-tight">
          Pour réserver les Canetons&nbsp;: <Tbd what="numéro pour les prestations" />
        </p>
      </Card>

      {seats.length > 0 ? (
        <ul className="mt-block grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {seats.map((seat) => (
            <Card key={seat.id} asChild className="gap-0 p-4">
              <li>
                {/* The title, then the person. That order is the legacy page's
                    and it is the one a visitor reads: they arrive looking for
                    "the person who handles costumes", not for a name they
                    already know. */}
                <p className="text-xs font-semibold tracking-wide text-violet uppercase">
                  {seat.title}
                </p>
                <p className="mt-tight">
                  {seat.firstName} {seat.lastName}
                </p>
              </li>
            </Card>
          ))}
        </ul>
      ) : (
        // NOT "aucun membre du comité", which would be a claim about the band.
        // The committee exists; nobody has been entered with a seat and a
        // consent to appear yet, and this page says so in the same voice as
        // every other gap on the public site.
        <p className="mt-block">
          <Tbd what="les fonctions et les noms du comité" />
        </p>
      )}
    </PageSection>
  );
}
