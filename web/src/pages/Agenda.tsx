import { PageSection } from "@/components/PageSection";

import { rowsOf } from "../api/collection";
import { useAgendaIndex } from "../api/generated/endpoints";
import type { PublicEventResource } from "../api/generated/model";
import { PageHero } from "../carnival/PageHero";
import { AgendaEntry, BADGE_TINTS } from "../events/PublicAgenda";
import { t } from "../i18n";

/**
 * Every upcoming public appearance, where a visitor can come and watch.
 *
 * Unlike the front page's block, which renders nothing when empty, this page
 * answers: somebody who navigated here asked for the schedule, and a heading
 * over blank space reads as a failed load. The empty sentence says the dates
 * are not published yet, which is also true while the request is in flight,
 * so there is no loading state (a short list on the same origin).
 *
 * The endpoint filters on `is_public`, which defaults to false, so rehearsals
 * and other private planning never show here.
 */
export function Agenda() {
  const agenda = useAgendaIndex();
  const upcoming = rowsOf<PublicEventResource>(agenda.data);

  return (
    <>
      <PageHero
        title={t("agenda.heading")}
        mark={t("agenda.headingHighlight")}
        seed={3}
        width="text"
      >
        <p>{t("agenda.intro")}</p>
      </PageHero>

      <PageSection width="text">
        {upcoming.length > 0 ? (
          <ul className="grid gap-5">
            {upcoming.map((event, index) => (
              <AgendaEntry
                key={event.id}
                event={event}
                tint={BADGE_TINTS[index % BADGE_TINTS.length]}
              />
            ))}
          </ul>
        ) : (
          <p className="rounded-[18px] border-3 border-dashed border-ink bg-panel px-4 py-5 text-ink-muted">
            {t("agenda.emptyNotice")}
          </p>
        )}
      </PageSection>
    </>
  );
}
