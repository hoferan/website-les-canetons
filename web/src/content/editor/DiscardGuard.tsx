import { useEffect, useState, type ReactNode } from "react";
import type { UseFormReturn } from "react-hook-form";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { useLeaveGuard } from "../../components/LeaveGuard";
import { t } from "../../i18n";
import type { BlockData, BlockKey } from "../registry";
import { asSaved, sameData } from "./useSaveBlock";

/**
 * Asks before an editor throws away what was typed (#355).
 *
 * Every way out that does not save goes through `requestClose`. It calls
 * `discard` at once while `dirty` is false, and otherwise asks first with
 * `question`, which the editor renders anywhere inside itself (the alert
 * dialog portals out). While `dirty`, reloading or closing the tab raises the
 * browser's own warning, and a link or Back asks through `useLeaveGuard`.
 *
 * A save closes the editor without coming through here: it calls its own
 * close once the block is stored.
 */
export function useDiscardGuard(
  dirty: boolean,
  discard: () => void,
): { requestClose: () => void; question: ReactNode } {
  const [asking, setAsking] = useState(false);
  useLeaveGuard(dirty, t("blockEditor.discardLeave"));

  const requestClose = () => (dirty ? setAsking(true) : discard());

  const question = (
    <AlertDialog open={asking} onOpenChange={setAsking}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("blockEditor.discardTitle")}</AlertDialogTitle>
          <AlertDialogDescription>{t("blockEditor.discardBody")}</AlertDialogDescription>
        </AlertDialogHeader>
        {/* Radix focuses the cancel, so Enter on a stray question keeps the
            edit. Throwing it away is final, hence `danger`. */}
        <AlertDialogFooter>
          <AlertDialogAction variant="danger" onClick={discard}>
            {t("blockEditor.discardConfirm")}
          </AlertDialogAction>
          <AlertDialogCancel>{t("blockEditor.discardKeep")}</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { requestClose, question };
}

/**
 * Whether a block's form differs from what it opened with, compared as a save
 * would send it, so a value typed and taken back again is no change.
 *
 * `restored` marks "Rétablir l'original" as a change for good, even where it
 * filled in what was already there: saving it still deletes a stored copy.
 */
export function useBlockChanged<K extends BlockKey>(
  blockKey: K,
  form: UseFormReturn<BlockData<K>>,
): { changed: boolean; restored: () => void } {
  // The form's values as it opened, before any field had a say.
  const [opened] = useState(() => asSaved(blockKey, form.getValues()));
  const [edited, setEdited] = useState(false);
  const [wasRestored, setRestored] = useState(false);

  useEffect(() => {
    // A subscription rather than a watched value, so the form re-renders only
    // when the answer flips, not on every keystroke.
    const subscription = form.watch((values) => {
      setEdited(!sameData(asSaved(blockKey, values as BlockData<K>), opened));
    });
    return () => subscription.unsubscribe();
  }, [blockKey, form, opened]);

  return { changed: edited || wasRestored, restored: () => setRestored(true) };
}
