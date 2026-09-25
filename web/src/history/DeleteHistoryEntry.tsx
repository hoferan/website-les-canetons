import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";

import {
  getHistoryEntryIndexQueryKey,
  historyEntryDestroy,
  historyEntryShow,
} from "../api/generated/endpoints";
import type { HistoryEntryResource } from "../api/generated/model";
import { entityTagOf, ifMatch } from "../api/ifMatch";
import { useApiFormError } from "../api/useApiFormError";
import { t } from "../i18n";

/**
 * The delete confirmation for one history entry.
 *
 * IT READS THE ENTRY'S TAG AS THE DIALOG OPENS, because the list hands out
 * none, and deletes with that tag and never a fresher one: a colleague's
 * change while the dialog is open then answers 412 instead of being deleted
 * unseen. The dialog stays open on a refusal so the 412 is read next to the
 * entry it is about.
 */
export function DeleteHistoryEntry({
  entry,
  onClose,
}: {
  entry: HistoryEntryResource | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const action = useApiFormError(t("history.deleteFailed"));
  const [busy, setBusy] = useState(false);
  const [opened, setOpened] = useState<{ id: number; etag: string | null } | null>(null);
  const entryId = entry?.id ?? null;

  useEffect(() => {
    if (entryId === null) {
      setOpened(null);
      return;
    }
    let abandoned = false;
    historyEntryShow(entryId)
      .then((read) => {
        if (!abandoned) {
          setOpened({ id: entryId, etag: entityTagOf(read) });
        }
      })
      .catch((thrown: unknown) => {
        if (!abandoned) {
          setOpened({ id: entryId, etag: null });
          action.setFromThrown(thrown);
        }
      });
    return () => {
      abandoned = true;
    };
    // action is a fresh object each render; only a new entry opens a new read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entryId]);

  async function confirm() {
    if (!entry || busy || opened?.id !== entry.id) {
      return;
    }
    setBusy(true);
    action.clear();
    try {
      const etag = opened.etag;
      if (etag === null) {
        // Without a tag the delete is refused with 428; the fallback
        // message is the honest thing to show instead.
        action.setFromThrown(new Error("no entity tag"));
        return;
      }
      await historyEntryDestroy(entry.id, ifMatch(etag));
      await queryClient.invalidateQueries({ queryKey: getHistoryEntryIndexQueryKey() });
      onClose();
    } catch (thrown) {
      action.setFromThrown(thrown);
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={entry !== null}
      onOpenChange={(next) => {
        if (!next) {
          action.clear();
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("history.deleteHeading")}</AlertDialogTitle>
          <AlertDialogDescription>{t("history.deleteDescription")}</AlertDialogDescription>
        </AlertDialogHeader>

        {action.error ? (
          <p role="alert" className="text-danger">
            {action.error.message}
          </p>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            aria-disabled={busy}
            onClick={() => void confirm()}
          >
            {t("common.delete")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
