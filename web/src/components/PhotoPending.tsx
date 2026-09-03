/**
 * Stands in for a photograph the band has yet to retake.
 *
 * WHY EVERY PHOTO WENT AT ONCE. The instructors' picture was already missing
 * nine of its seventeen subjects, and on 2026-08-31 the band's instruction was
 * to treat the rest the same way — "because we have to assume that those are out
 * of date". A youth band turns over yearly, so a group photograph is a claim
 * about who is in the band, and a wrong claim is worse than an honest gap.
 *
 * The header LOGO is deliberately not one of these: it is the band's identity,
 * not a photograph that can go stale.
 *
 * `what` completes the sentence — "des trompettes", "du parrain et de la
 * marraine" — so a placeholder always names what is missing. A single shared
 * string would read wrong under half the headings it appears beneath.
 *
 * `grep -rl "<PhotoPending" web/src/pages` lists what is still awaited.
 */
export function PhotoPending({ what }: { what: string }) {
  return (
    // ONE LINE, NOT A BOX. This was a 160px-minimum panel, and /canetons shows
    // eight of them: 1280px, 42% of the page, reserved for content that is not
    // there. The photographed page is LONGER than the placeholder page — about
    // 3554px against 3034px at 390px — so the height was never standing in for
    // anything. See the E2a spec. Dashed and muted so it still reads as a gap
    // rather than as copy.
    <p
      className="mt-4 rounded-lg border border-dashed border-line bg-panel px-3 py-2 text-sm text-ink-muted"
      data-photo-pending={what}
    >
      {/* Both spaces are non-breaking. Now that this is one line rather than a
          centred box, a plain space before the camera let it wrap onto a line
          of its own under the longer `what` values — "des Canetons au complet"
          and "des Canetons en concert" both did it at 390px. */}
      Nouvelle photo {what} à venir&nbsp;!&nbsp;<span aria-hidden="true">📷</span>
    </p>
  );
}
