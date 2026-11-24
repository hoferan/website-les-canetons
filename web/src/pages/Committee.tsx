import { Surface } from "@ds";
import { PageSection } from "@/components/PageSection";
import { Tbd } from "@/components/Tbd";

import { rowsOf } from "../api/collection";
import { useCommitteeIndex } from "../api/generated/endpoints";
import type { CommitteeMemberResource } from "../api/generated/model";
import { CardsBlock } from "../content/blocks/CardsBlock";
import { HeroBlock } from "../content/blocks/HeroBlock";
import { useShowsGaps } from "../content/EditMode";
import { ManagedElsewhere } from "../content/editor/ManagedElsewhere";
import { t } from "../i18n";
import { Link } from "../i18n/routing";
import { usePageTitle } from "../components/pageTitle";

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
  usePageTitle(t("nav.committee"));
  const committee = useCommitteeIndex();
  const seats = rowsOf<CommitteeMemberResource>(committee.data);
  const showsGaps = useShowsGaps();

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
                  <Link to="/contact" className="link-target text-violet underline">
                    {t("committee.writeToCommittee")}
                  </Link>
                </p>
              ),
            },
          }}
        />

        {/* The seats are the roster's, so they carry no pencil: the notice
            above says where they are changed. */}
        {seats.length > 0 || showsGaps ? (
          <div className="mt-block">
            {seats.length > 0 ? (
              <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {seats.map((seat) => (
                  <Surface key={seat.id} as="li" variant="feature" className="flex flex-col">
                    {/* The seat, then the person: a visitor looks for "the
                    person who handles costumes", not a name they know. */}
                    <p className="text-xs font-semibold tracking-wide text-violet uppercase">
                      {seat.function}
                    </p>
                    <p className="mt-tight">
                      {seat.firstName} {seat.lastName}
                    </p>
                  </Surface>
                ))}
              </ul>
            ) : (
              // A gap, in the voice of every other gap on the public site, and
              // for an editor only: a visitor gets nothing here rather than
              // "Aucun membre du comité", a false claim about the band (ADR 0048).
              <p>
                <Tbd what={t("placeholders.committeeSeats")} token="committee-seats" />
              </p>
            )}
          </div>
        ) : null}
      </PageSection>
    </>
  );
}
