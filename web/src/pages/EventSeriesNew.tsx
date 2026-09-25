import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { rowsOf } from "../api/collection";
import { getEventIndexQueryKey, useEventSeries } from "../api/generated/endpoints";
import type { EventResource, StoreEventSeriesRequest } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { type SeriesCreatedState } from "../events/SeriesCreatedNotice";
import { SeriesForm } from "../events/SeriesForm";
import { t } from "../i18n";

/**
 * A whole season in one request.
 *
 * IT LANDS ON THE PLANNING, carrying the count (#103). It used to report the
 * count in place, on its own path, and a check that read the URL took that
 * for a failed save and ran it again: two identical seasons on TEST. The
 * planning is also where the new rehearsals are, so the count is read beside
 * them, and it stays there until dismissed, with a link to generate the
 * season's second rehearsal variant straight away.
 *
 * THE COUNT IS THE SERVER'S, read off the created collection rather than off
 * the ticked dates. They should agree; if they ever do not, the honest number
 * is the one describing what exists.
 */
export function EventSeriesNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useApiFormError(t("seriesForm.createFailed"));
  const create = useEventSeries();

  async function submit(request: StoreEventSeriesRequest) {
    form.clear();

    try {
      const result = await create.mutateAsync({ data: request });
      await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
      // A 201 carrying a collection — which is exactly why rowsOf narrows on
      // any 2xx rather than on 200. See web/src/api/collection.ts.
      const state: SeriesCreatedState = {
        seriesCreated: rowsOf<EventResource>(result).length,
      };
      navigate("/events", { state });
    } catch (thrown) {
      // The form stays open, with the ticks intact: a refused template has to
      // be corrected where it was typed, and re-choosing the range would mean
      // unticking the school holidays all over again.
      form.setFromThrown(thrown);
    }
  }

  return (
    <PageSection>
      <h1 className="font-display text-3xl">{t("seriesForm.newHeading")}</h1>

      <SeriesForm
        busy={create.isPending}
        error={form.error}
        problemFor={form.messageFor}
        onSubmit={submit}
        onCancel={() => navigate("/events")}
      />
    </PageSection>
  );
}
