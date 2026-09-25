import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { getHistoryEntryIndexQueryKey, historyEntryStore } from "../api/generated/endpoints";
import type { StoreHistoryEntryRequest } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { HistoryForm } from "../history/HistoryForm";
import { t } from "../i18n";

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

  async function submit(data: StoreHistoryEntryRequest) {
    form.clear();
    try {
      await create.mutateAsync(data);
      await queryClient.invalidateQueries({ queryKey: getHistoryEntryIndexQueryKey() });
      navigate("/history");
    } catch (thrown) {
      // The form stays open: a refusal is corrected where it was typed.
      form.setFromThrown(thrown);
    }
  }

  return (
    <PageSection width="text">
      <h1 className="font-display text-3xl">{t("historyForm.newHeading")}</h1>
      <HistoryForm
        entry={null}
        busy={create.isPending}
        error={form.error}
        problemFor={form.messageFor}
        onSubmit={(data) => void submit(data)}
        onCancel={() => navigate("/history")}
      />
    </PageSection>
  );
}
