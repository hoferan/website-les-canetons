import { photoPlacementHistory } from "../api/generated/endpoints";
import type { PhotoChange } from "./HistoryForm";

/**
 * Saves an entry's photo once the entry itself has saved. True when there was
 * nothing to save or it saved.
 *
 * It never throws: by now the entry is stored, so a failure here must not
 * reopen the form, where saving again would write the entry a second time.
 * The caller reports it on the timeline instead.
 */
export async function saveHistoryPhoto(entryId: number, change: PhotoChange): Promise<boolean> {
  if (change === null) {
    return true;
  }
  try {
    await photoPlacementHistory(entryId, change);
    return true;
  } catch {
    return false;
  }
}
