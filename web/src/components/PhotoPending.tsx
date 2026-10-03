import { Camera } from "lucide-react";

import { t } from "../i18n";

/** One class string for both frames, so they are the same box. */
const FRAME_CLASS =
  "mt-related flex aspect-[3/2] w-full flex-col items-center justify-center gap-2 rounded-lg bg-linear-to-br from-violet/5 to-violet/15 px-4 text-center text-violet";

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
 * THE SHAPE OF A PHOTO. The frame is 3:2, as wide as the column and rounded
 * like a placed photo, so empty and filled slots line up and the page does not
 * jump when a photo arrives. It is a soft violet tint with no border: a dashed
 * outline read as a broken image or a drop zone, and /band stacks seven of
 * these. This is what a visitor sees; an editor gets the add button in
 * `SlotPhotoControl`, drawn in the same frame.
 *
 * `token` is a STABLE, ENGLISH identifier for the slot ("band", "concert",
 * "register"), carried on `data-photo-pending` so tests and the e2e specs can
 * tell the slots apart in either locale.
 *
 * `PhotoReserved` is the same frame without the caption, for the moment the
 * page does not yet know whether the slot is empty. The two share one class
 * string, so the box is the same height and nothing below it moves when the
 * answer arrives.
 */
export function PhotoPending({ token }: { token: string }) {
  return (
    // Violet on this tint measured 5.8:1 at the darkest corner and 6.8:1 at
    // the lightest, so the caption and the icon both pass AA.
    <div className={FRAME_CLASS} data-photo-pending={token}>
      <Camera aria-hidden="true" className="size-10" strokeWidth={1.5} />
      <p className="text-sm font-medium">{t("placeholders.photoPending")}</p>
    </div>
  );
}

/** The frame while /site-photos is still on its way: no caption, hidden from assistive technology. */
export function PhotoReserved() {
  return <div aria-hidden="true" className={FRAME_CLASS} data-photo-reserved="" />;
}
