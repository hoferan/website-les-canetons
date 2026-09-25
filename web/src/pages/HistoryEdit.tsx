import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

import {
  getHistoryEntryIndexQueryKey,
  historyEntryShow,
  historyEntryUpdate,
} from "../api/generated/endpoints";
import type { HistoryEntryResource, StoreHistoryEntryRequest } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { PageSection } from "../components/PageSection";
import { HistoryForm } from "../history/HistoryForm";
import { t } from "../i18n";

/**
 * Correcting one entry of the history.
 *
 * It reads the entry before showing it, once, for the same reason EventEdit
 * does: the PUT is a conditional write, and its tag has to describe what the
 * form was opened with.
 */
export function HistoryEdit() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const form = useApiFormError(t("historyForm.saveFailed"));
  const entryId = Number(id);

  const [opened, setOpened] = useState<{ entry: HistoryEntryResource; etag: string | null } | null>(
    null,
  );
  const [readError, setReadError] = useState<string | null>(null);

  // By hand, because the If-Match differs per call; see web/src/api/ifMatch.ts.
  const update = useMutation({
    mutationFn: ({ data, etag }: { data: StoreHistoryEntryRequest; etag: string }) =>
      historyEntryUpdate(entryId, data, ifMatch(etag)),
  });

  useEffect(() => {
    let abandoned = false;

    async function open() {
      try {
        const response = await historyEntryShow(entryId);
        if (abandoned) {
          return;
        }
        if (response.status !== 200) {
          // Unreachable: the mutator throws on every non-2xx.
          setReadError(t("historyForm.loadFailed"));
          return;
        }
        setOpened({ entry: response.data, etag: entityTagOf(response) });
      } catch {
        if (!abandoned) {
          setReadError(t("historyForm.loadFailed"));
        }
      }
    }

    void open();

    return () => {
      abandoned = true;
    };
  }, [entryId]);

  async function submit(data: StoreHistoryEntryRequest) {
    form.clear();

    if (opened?.etag == null) {
      // Without a tag the write is refused with 428, which would read as a
      // broken save.
      setReadError(t("historyForm.loadFailed"));
      return;
    }

    try {
      await update.mutateAsync({ data, etag: opened.etag });
      await queryClient.invalidateQueries({ queryKey: getHistoryEntryIndexQueryKey() });
      navigate("/history");
    } catch (thrown) {
      // Open, so a 412 is read next to the values it is about.
      form.setFromThrown(thrown);
    }
  }

  return (
    <PageSection width="text">
      <h1 className="font-display text-3xl">{t("historyForm.editHeading")}</h1>

      {readError ? (
        <p role="alert" className="mt-block text-danger">
          {readError}
        </p>
      ) : null}

      {opened === null && readError === null ? (
        <p className="mt-block text-ink-muted">{t("common.loading")}</p>
      ) : null}

      {opened ? (
        <HistoryForm
          entry={opened.entry}
          busy={update.isPending}
          error={form.error}
          problemFor={form.messageFor}
          onSubmit={(data) => void submit(data)}
          onCancel={() => navigate("/history")}
        />
      ) : null}
    </PageSection>
  );
}
