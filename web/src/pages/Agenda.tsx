import { PageSection } from "@/components/PageSection";

import { rowsOf } from "../api/collection";
import { useAgendaIndex } from "../api/generated/endpoints";
import type { PublicEventResource } from "../api/generated/model";
import { PageHero } from "../carnival/PageHero";
import { AgendaEntry, BADGE_TINTS } from "../events/PublicAgenda";
import { t } from "../i18n";

/**
 * Every upcoming public appearance — where a visitor can come and watch.
 *
 * THIS PAGE OWES AN ANSWER, WHICH IS THE WHOLE DIFFERENCE FROM THE FRONT
 * PAGE'S BLOCK. That one renders nothing when there is nothing, because a
 * visitor who came to read about the band never asked for a schedule and
 * "aucune date" under the hero reads as "this band does nothing". Somebody who
 * navigated HERE asked, and leaving them on a heading over blank space is the
 * page failing to load as far as they can tell. So the empty case is written
 * out, and it says what is true: the dates are not published yet, not that
 * there are none.
 *
 * NO LOADING STATE STILL. The read is one request against a list of a few
 * dozen rows on the same origin, and a spinner that flashes for 80ms is worse
 * than the sentence appearing 80ms late. What would be wrong is the sentence
 * claiming emptiness while the request is in flight — so it is phrased as "pas
 * encore publiées", which is true both while loading and when the list really
 * is empty.
 *
 * A REHEARSAL IS NOT HERE. The endpoint filters on `is_public`, which defaults
 * to false, so the band's private planning stays private and this page shows
 * the appearances somebody decided to publish.
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
