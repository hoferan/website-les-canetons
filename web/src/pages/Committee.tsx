import { Link } from "react-router-dom";

import { PageSection } from "@/components/PageSection";
import { Tbd } from "@/components/Tbd";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { rowsOf } from "../api/collection";
import { useCommitteeIndex } from "../api/generated/endpoints";
import type { CommitteeMemberResource } from "../api/generated/model";
import { PageHero } from "../carnival/PageHero";
import { RAISED_CARD } from "../carnival/raised";
import { t } from "../i18n";

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
 * committee and cannot be harvested. The booking number stays a placeholder,
 * because a wrong number sends a caller to a stranger.
 */
export function Committee() {
  const committee = useCommitteeIndex();
  const seats = rowsOf<CommitteeMemberResource>(committee.data);

  return (
    <>
      <PageHero title={t("committee.heading")} mark={t("committee.headingHighlight")} seed={19} />

      <PageSection>
        {/* On yellow, because it is what most visitors came for: how to reach
            the committee. On it the violet link is 5.5:1 and the muted
            placeholder 4.9:1. */}
        <Card className={cn(RAISED_CARD, "gap-0 bg-yellow p-5")}>
          <h2 className="font-display text-xl">{t("committee.contactHeading")}</h2>
          <p className="mt-tight">
            <Link to="/contact" className="text-violet underline">
              {t("committee.writeToCommittee")}
            </Link>
          </p>
          <p className="mt-tight">
            {t("committee.booking")}{" "}
            <Tbd what={t("placeholders.bookingNumber")} token="booking-number" />
          </p>
        </Card>

        {seats.length > 0 ? (
          <ul className="mt-block grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
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
          <p className="mt-block">
            <Tbd what={t("placeholders.committeeSeats")} token="committee-seats" />
          </p>
        )}
      </PageSection>
    </>
  );
}
