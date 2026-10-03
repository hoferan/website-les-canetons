import { useMemo } from "react";

import { rowsOf } from "../api/collection";
import { usePhotoSlotIndex } from "../api/generated/endpoints";
import type { PhotoSlotResource } from "../api/generated/model";
import type { PhotoData } from "./Photo";

/**
 * The slot names that follow a record rather than a page. The API deletes a
 * history entry's slot with the entry (PhotoSlot::forHistory), so that name
 * must match it exactly.
 */
export const registerSlot = (sectionId: number) => `register-${sectionId}`;
export const historySlot = (entryId: number) => `history-${entryId}`;

/**
 * Every placed photo slot, read once however many slots a page shows: each
 * caller shares the one query. A slot with nothing placed is absent, and
 * `photoOf` answers null for it.
 */
export function usePhotoSlots(): {
  isPending: boolean;
  photoOf: (slot: string) => PhotoData | null;
} {
  const query = usePhotoSlotIndex();
  const bySlot = useMemo(
    () => new Map(rowsOf<PhotoSlotResource>(query.data).map((row) => [row.slot, row])),
    [query.data],
  );
  return {
    isPending: query.isPending,
    photoOf: (slot) => bySlot.get(slot) ?? null,
  };
}
