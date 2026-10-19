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
 * It lands on the planning, carrying the count (#103), so the URL says the
 * save worked: a count reported in place, on the form's own path, reads as a
 * failed save to anything checking the URL, and running it again creates the
 * season twice. The count stays beside the new rehearsals until dismissed,
 * with a link to generate the season's second rehearsal variant.
 *
 * The count is the server's, read off the created collection rather than the
 * ticked dates, so it describes what exists.
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
      // A 201 carrying a collection, which is why rowsOf narrows on any 2xx.
      // See web/src/api/collection.ts.
      const state: SeriesCreatedState = {
        seriesCreated: rowsOf<EventResource>(result).length,
      };
      navigate("/events", { state });
    } catch (thrown) {
      // The form stays open with the ticks intact, so a refused template is
      // corrected where it was typed without unticking the holidays again.
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
