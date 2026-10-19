import { Camera } from "lucide-react";

import { t } from "../i18n";

/**
 * Stands in for a photograph the band has yet to retake.
 *
 * A youth band turns over yearly, so a group photograph is a claim about who
 * is in the band, and a wrong claim is worse than an honest gap. The header
 * logo is the band's identity and never goes stale, so it is not one of these.
 *
 * One sentence for every slot: the placeholder sits under the heading it
 * belongs to, so naming the slot adds nothing.
 *
 * One line, not a box: a photo-sized frame per empty slot would fill /band at
 * 390px with empty boxes. The editor's add button in `SlotPhotoControl` is the
 * full frame, because for them the frame is the thing to tap.
 *
 * `token` is a stable English identifier for the slot ("band", "concert",
 * "register"), carried on `data-photo-pending` so tests and the e2e specs can
 * tell the slots apart in either locale.
 */
export function PhotoPending({ token }: { token: string }) {
  return (
    <p
      className="mt-related flex items-center gap-2 text-sm text-ink-muted"
      data-photo-pending={token}
    >
      <Camera aria-hidden="true" className="size-4 shrink-0" />
      {t("placeholders.photoPending")}
    </p>
  );
}

/**
 * The frame while the photo slots are on their way: photo-shaped, uncaptioned
 * and hidden from assistive technology. Once the committee has placed the
 * photos, which is the normal case, the space is already there when the photo
 * arrives and nothing below it moves.
 */
export function PhotoReserved() {
  return (
    <div
      aria-hidden="true"
      className="mt-related aspect-[3/2] w-full rounded-lg bg-linear-to-br from-violet/5 to-violet/15"
      data-photo-reserved=""
    />
  );
}
