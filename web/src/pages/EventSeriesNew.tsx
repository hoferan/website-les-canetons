import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { rowsOf } from "../api/collection";
import { getEventIndexQueryKey, useEventSeries } from "../api/generated/endpoints";
import type { EventResource, StoreEventSeriesRequest } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { ButtonLink } from "../components/ButtonLink";
import { PageSection } from "../components/PageSection";
import { SeriesForm } from "../events/SeriesForm";

/**
 * A whole season in one request.
 *
 * IT REPORTS THE COUNT AND STAYS, rather than returning to the planning the
 * moment it succeeds — a deviation from the plan, which said to navigate. Two
 * reasons, both from what this screen actually does: it writes up to sixty
 * rows at once, so "4 événements créés" is the only confirmation that the
 * generator did what the preview promised, and a message shown on the way out
 * is a message nobody reads. The band's real season also has two rehearsal
 * variants, so generating a second series straight afterwards is the normal
 * case rather than an edge one.
 *
 * THE COUNT IS THE SERVER'S, read off the created collection rather than off
 * the ticked dates. They should agree; if they ever do not, the honest number
 * is the one describing what exists.
 */
export function EventSeriesNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useApiFormError("La création de la série a échoué.");
  const create = useEventSeries();

  const [created, setCreated] = useState<number | null>(null);

  async function submit(request: StoreEventSeriesRequest) {
    form.clear();

    try {
      const result = await create.mutateAsync({ data: request });
      // A 201 carrying a collection — which is exactly why rowsOf narrows on
      // any 2xx rather than on 200. See web/src/api/collection.ts.
      setCreated(rowsOf<EventResource>(result).length);
      await queryClient.invalidateQueries({ queryKey: getEventIndexQueryKey() });
    } catch (thrown) {
      // The form stays open, with the ticks intact: a refused template has to
      // be corrected where it was typed, and re-choosing the range would mean
      // unticking the school holidays all over again.
      form.setFromThrown(thrown);
    }
  }

  return (
    <PageSection>
      <h1 className="font-display text-3xl">Nouvelle série</h1>

      {created === null ? (
        <SeriesForm
          busy={create.isPending}
          error={form.error}
          problemFor={form.messageFor}
          onSubmit={submit}
          onCancel={() => navigate("/events")}
        />
      ) : (
        <div className="mt-block flex flex-col gap-related rounded-md border border-line bg-panel p-4">
          <p role="status" className="text-ink">
            {created} {created === 1 ? "événement créé" : "événements créés"}.
          </p>
          <div className="flex flex-wrap gap-related">
            <ButtonLink to="/events">Voir le planning</ButtonLink>
            {/* The season has two rehearsal variants, so a second series is
                the normal next step rather than an edge case. */}
            <button
              type="button"
              className="focus-ring min-h-touch text-ink underline"
              onClick={() => setCreated(null)}
            >
              Créer une autre série
            </button>
          </div>
        </div>
      )}
    </PageSection>
  );
}
