import { PageSection } from "@/components/PageSection";
import { Tbd } from "@/components/Tbd";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { rowsOf } from "../api/collection";
import { useCommitteeIndex } from "../api/generated/endpoints";
import type { CommitteeMemberResource } from "../api/generated/model";
import { RAISED_CARD } from "../carnival/raised";
import { CardsBlock } from "../content/blocks/CardsBlock";
import { HeroBlock } from "../content/blocks/HeroBlock";
import { ManagedElsewhere } from "../content/editor/ManagedElsewhere";
import { t } from "../i18n";
import { Link } from "../i18n/routing";

/**
 * The committee: who to write to, and who holds which seat.
 *
 * Generated from the roster. A seat is a row in `committee_functions` that a
 * member points at, so the committee maintains the list without a deploy.
 *
 * The seats come in the band's rank order (`sort_order` on that table), and
 * the ordering is the API's. This component does no sorting of its own, so
 * the two cannot disagree.
 *
 * No email address is published: the contact form stores the message for the
 * committee and cannot be harvested. The contact card is the band's to change
 * (`committee.contact`); its booking number ships as a placeholder, because a
 * guessed number sends a caller to a stranger.
 */
export function Committee() {
  const committee = useCommitteeIndex();
  const seats = rowsOf<CommitteeMemberResource>(committee.data);

  return (
    <>
      <HeroBlock blockKey="committee.hero" seed={19} />

      <PageSection>
        <ManagedElsewhere
          className="mb-block"
          sources={[
            {
              sentence: "blockEditor.managedElsewhere.committeeSeats",
              to: "/members",
              page: t("nav.members"),
              permission: "members.manage",
            },
          ]}
        />

        {/* The link to the form is page code, between the card's heading and
            its booking line: the band has nothing to change there. */}
        <CardsBlock
          blockKey="committee.contact"
          layout="wide"
          slots={{
            contact: {
              beforeRows: (
                <p className="mt-tight">
                  <Link to="/contact" className="text-violet underline">
                    {t("committee.writeToCommittee")}
                  </Link>
                </p>
              ),
            },
          }}
        />

        {/* The seats are the roster's, so they carry no pencil: the notice
            above says where they are changed. */}
        <div className="mt-block">
          {seats.length > 0 ? (
            <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {seats.map((seat) => (
                <Card key={seat.id} asChild className={cn(RAISED_CARD, "gap-0 p-4")}>
                  <li>
                    {/* The seat, then the person: a visitor looks for "the
                      person who handles costumes", not a name they know. */}
                    <p className="text-xs font-semibold tracking-wide text-violet uppercase">
                      {seat.function}
                    </p>
                    <p className="mt-tight">
                      {seat.firstName} {seat.lastName}
                    </p>
                  </li>
                </Card>
              ))}
            </ul>
          ) : (
            // A gap, in the voice of every other gap on the public site.
            // "Aucun membre du comité" would be a false claim about the band.
            <p>
              <Tbd what={t("placeholders.committeeSeats")} token="committee-seats" />
            </p>
          )}
        </div>
      </PageSection>
    </>
  );
}
