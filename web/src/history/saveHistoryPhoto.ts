import type { QueryClient } from "@tanstack/react-query";

import {
  getHistoryEntryIndexQueryKey,
  getImageIndexQueryKey,
  getPhotoSlotIndexQueryKey,
  photoSlotUpdate,
} from "../api/generated/endpoints";
import type { HistoryEntryResource } from "../api/generated/model";
import { t } from "../i18n";
import { historySlot } from "../images/photoSlots";
import type { PhotoChange } from "./HistoryForm";

/**
 * Saves an entry's photo into the entry's photo slot once the entry itself
 * has saved. True when there was nothing to save or it saved.
 *
 * It never throws: by now the entry is stored, so a failure here must not
 * reopen the form, where saving again would write the entry a second time.
 * The caller reports it on the timeline instead.
 */
export async function saveHistoryPhoto(
  entry: HistoryEntryResource,
  change: PhotoChange,
): Promise<boolean> {
  if (change === null) {
    return true;
  }
  const title = entry.titleFr ?? entry.titleDe ?? entry.occurredOn;
  try {
    await photoSlotUpdate(historySlot(entry.id), {
      imageId: change.imageId,
      label: t("photos.slot.history", { title }),
      path: "/history",
    });
    return true;
  } catch {
    return false;
  }
}

/** The reads a history save changes: the timeline, its photos, and where the library says each photo is used. */
export async function invalidateHistory(queryClient: QueryClient): Promise<void> {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getHistoryEntryIndexQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getPhotoSlotIndexQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getImageIndexQueryKey() }),
  ]);
}
