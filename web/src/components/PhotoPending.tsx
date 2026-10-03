import { Camera } from "lucide-react";

import { t } from "../i18n";

/**
 * Stands in for a photograph the band has yet to retake.
 *
 * WHY EVERY PHOTO WENT AT ONCE. The instructors' picture was already missing
 * nine of its seventeen subjects, and on 2026-08-31 the band's instruction was
 * to treat the rest the same way, "because we have to assume that those are
 * out of date". A youth band turns over yearly, so a group photograph is a
 * claim about who is in the band, and a wrong claim is worse than an honest
 * gap.
 *
 * The header LOGO is deliberately not one of these: it is the band's identity,
 * not a photograph that can go stale.
 *
 * ONE SENTENCE FOR EVERY SLOT. It used to name what was missing ("Nouvelle
 * photo du registre X à venir !"), which took a sentence per case and a
 * register's name glued into French grammar. The placeholder sits under the
 * heading it belongs to, so the name added nothing.
 *
 * ONE LINE, NOT A BOX. A photo-sized frame per empty slot made /band at 390px
 * about 1,700px of empty boxes, and put a large empty box first on the home
 * page. A line is enough to tell a visitor a photo is coming. The editor's add
 * button in `SlotPhotoControl` is the full frame, because for them the frame
 * is the thing to tap.
 *
 * `token` is a STABLE, ENGLISH identifier for the slot ("band", "concert",
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
