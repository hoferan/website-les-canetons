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
    <div
      className="mt-6 flex min-h-40 items-center justify-center rounded-lg border border-dashed border-line bg-panel px-4 py-10 text-center"
      data-photo-pending={what}
    >
      <p className="text-ink-muted">
        Nouvelle photo {what} à venir&nbsp;! <span aria-hidden="true">📷</span>
      </p>
    </div>
  );
}
