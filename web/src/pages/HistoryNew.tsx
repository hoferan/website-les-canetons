import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { historyEntryStore } from "../api/generated/endpoints";
import type { HistoryEntryResource, StoreHistoryEntryRequest } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { HistoryForm, type PhotoChange } from "../history/HistoryForm";
import { invalidateHistory, saveHistoryPhoto } from "../history/saveHistoryPhoto";
import { t } from "../i18n";
import { type HistorySavedState } from "./History";

/**
 * Adding one entry to the band's history.
 *
 * Behind history.manage in the route table, so there is no permission check in
 * here. Saving goes back to /history, where the new entry is on the line.
 */
export function HistoryNew() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useApiFormError(t("historyForm.saveFailed"));
  const create = useMutation({
    mutationFn: (data: StoreHistoryEntryRequest) => historyEntryStore(data),
  });

  async function submit(data: StoreHistoryEntryRequest, photo: PhotoChange) {
    form.clear();
    let saved: HistoryEntryResource;
    try {
      const response = await create.mutateAsync(data);
      // The mutator throws on every non-2xx, so this only narrows the type.
      if (response.status !== 201) {
        return;
      }
      saved = response.data;
    } catch (thrown) {
      // The form stays open: a refusal is corrected where it was typed.
      form.setFromThrown(thrown);
      return;
    }
    // The entry exists from here on, so whatever the photo does, the form
    // closes: saving it again would add the entry twice.
    const photoSaved = await saveHistoryPhoto(saved, photo);
    await invalidateHistory(queryClient);
    const state: HistorySavedState = { historySaved: true, photoFailed: !photoSaved };
    navigate("/history", { state });
  }

  return (
    <PageSection width="text">
      <h1 className="font-display text-3xl">{t("historyForm.newHeading")}</h1>
      <HistoryForm
        entry={null}
        busy={create.isPending}
        error={form.error}
        problemFor={form.messageFor}
        onSubmit={(data, photo) => void submit(data, photo)}
        onCancel={() => navigate("/history")}
      />
    </PageSection>
  );
}
