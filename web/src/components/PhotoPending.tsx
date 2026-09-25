/**
 * Stands in for a photograph the band has yet to retake.
 *
 * WHY EVERY PHOTO WENT AT ONCE. The instructors' picture was already missing
 * nine of its seventeen subjects, and on 2026-08-31 the band's instruction was
 * to treat the rest the same way — "because we have to assume that those are
 * out of date". A youth band turns over yearly, so a group photograph is a
 * claim about who is in the band, and a wrong claim is worse than an honest
 * gap.
 *
 * The header LOGO is deliberately not one of these: it is the band's identity,
 * not a photograph that can go stale.
 *
 * `sentence` IS A WHOLE, ALREADY-TRANSLATED SENTENCE, not a fragment glued onto
 * a hardcoded template. It used to be a `what` fragment interpolated into
 * "Nouvelle photo {what} à venir !" — a French prepositional phrase ("des
 * Canetons au complet", or a generated `` `du registre ${name}` ``). German
 * needs a genitive rather than a preposition, and a preposition glued to a
 * database value cannot be translated at all, so each caller now picks the
 * whole sentence that fits what is missing (`placeholders.photoBand`,
 * `.photoConcert`, `.photoRegister`) and passes the rendered result here. A
 * register's own name stays interpolated inside that sentence — it is content
 * a committee typed, not something a translation layer could reach.
 *
 * `token` is a STABLE, ENGLISH identifier for what is missing — "band",
 * "concert", "register" — carried on `data-photo-pending` so it does not
 * change per locale. It used to be the French fragment itself.
 *
 * `grep -rl "<PhotoPending" web/src/pages` lists what is still awaited.
 */
export function PhotoPending({ sentence, token }: { sentence: string; token: string }) {
  return (
    // ONE LINE, NOT A BOX. This was a 160px-minimum panel, and the band page
    // shows eight of them: 1280px, 42% of the page, reserved for content that
    // is not there. The photographed page is LONGER than the placeholder page
    // — about 3554px against 3034px at 390px — so the height was never
    // standing in for anything; RegisterIndex is what answers the length.
    // Dashed and muted so it still reads as a gap rather than as copy.
    <p
      className="mt-related rounded-lg border border-dashed border-line bg-panel px-3 py-2 text-sm text-ink-muted"
      data-photo-pending={token}
    >
      {/* The nbsp between the sentence and the camera is structural, not
          translated content: now that this is one line rather than a centred
          box, a plain space before the camera let it wrap onto a line of its
          own under the longer sentences at 390px. */}
      {sentence}&nbsp;<span aria-hidden="true">📷</span>
    </p>
  );
}
