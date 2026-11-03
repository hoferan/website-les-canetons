import { Link } from "react-router-dom";

import { PageSection } from "@/components/PageSection";

import { useBlock } from "../content/BlocksProvider";
import { CardsBlock } from "../content/blocks/CardsBlock";
import { HeroBlock } from "../content/blocks/HeroBlock";
import { t } from "../i18n";

/**
 * How to join: the page a parent or a curious child lands on.
 *
 * The only tutoiement on the public site: this heading addresses the child
 * directly, which is who it is for. The home page stays impersonal because
 * it is read by both.
 *
 * The cards are the band's to change (`join.facts`). The joining contacts
 * ship as placeholders with no number: a guessed one dials a stranger, while
 * a parent who sees a gap writes to the committee, the fallback offered in
 * the contacts card until the band gives a number.
 */
export function Join() {
  const facts = useBlock("join.facts");
  const contacts = facts.cards.find((card) => card.id === "contacts");
  const reachable =
    contacts?.rows.some((row) => row.type === "phone" && row.number.trim() !== "") ?? false;

  return (
    <>
      <HeroBlock blockKey="join.hero" seed={5} />

      <PageSection>
        <CardsBlock
          blockKey="join.facts"
          slots={{
            contacts: {
              afterRows: reachable ? null : (
                <p className="mt-related text-sm text-ink-muted">
                  {t("join.contactMeanwhile")}{" "}
                  <Link to="/contact" className="text-violet underline">
                    {t("join.contactPageLink")}
                  </Link>
                  .
                </p>
              ),
            },
          }}
        />
      </PageSection>
    </>
  );
}
