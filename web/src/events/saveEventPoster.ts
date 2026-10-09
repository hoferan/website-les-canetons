import type { QueryClient } from "@tanstack/react-query";

import {
  getAgendaIndexQueryKey,
  getImageIndexQueryKey,
  photoSlotUpdate,
} from "../api/generated/endpoints";
import { t } from "../i18n";
import type { PhotoData } from "../images/Photo";
import { eventSlot } from "../images/photoSlots";

/** The poster to save after the event, or null to leave it as it is. */
export type PosterChange = { imageId: number | null; photo: PhotoData | null } | null;

/**
 * Saves an event's poster into the event's photo slot once the event itself
 * has saved. True when there was nothing to save or it saved.
 *
 * It never throws, like saveHistoryPhoto: by now the event is stored, and the
 * caller must not treat the form as unsaved, where saving again would create
 * a second event.
 */
export async function saveEventPoster(
  eventId: number,
  title: string,
  change: PosterChange,
  queryClient: QueryClient,
): Promise<boolean> {
  if (change === null) {
    return true;
  }
  try {
    await photoSlotUpdate(eventSlot(eventId), {
      imageId: change.imageId,
      label: t("photos.slot.event", { title }),
      path: `/events/${eventId}/edit`,
    });
  } catch {
    return false;
  }
  // The planning is refreshed by the caller after every save. These two are
  // the poster's own: the public agenda shows it, and the library lists where
  // each photo is used.
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: getAgendaIndexQueryKey() }),
    queryClient.invalidateQueries({ queryKey: getImageIndexQueryKey() }),
  ]);
  return true;
}
