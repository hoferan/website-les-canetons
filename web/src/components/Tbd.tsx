/**
 * A visible placeholder for content the band has not yet confirmed.
 *
 * WHY THIS EXISTS. The 2026-08-31 content audit asked fourteen questions about
 * the site's factual claims. For the committee, the register rosters, the
 * instructors and the published phone numbers the answer was "don't know yet —
 * replace them with placeholders so I know exactly what to update later". A
 * stale name is worse than an obvious gap: a parent who rings the wrong person
 * gets a wrong answer, whereas a parent who sees a gap asks.
 *
 * So this renders something no reader can mistake for real content, and that
 * `grep -c "<Tbd" web/src` counts exactly. That count is the to-do list.
 *
 * IT MUST BE EMPTY BEFORE PROD. TEST and QA are behind HTTP Basic Auth, so
 * placeholders there are seen only by the band. PROD is public and has never
 * been deployed. Deploying it while any of these remain would publish "à
 * compléter" where the committee should be. See docs/continue-here.md.
 */
export function Tbd({ what }: { what?: string }) {
  return (
    <span
      // Italic and muted so it reads as unfinished rather than broken, with a
      // dotted underline so it is still obvious in a screenshot or in print,
      // where colour alone may not survive.
      className="text-ink-muted italic underline decoration-dotted"
      // Announced as written: a screen-reader user needs to know the field is
      // blank for everyone, not that their software failed to read a name.
      data-tbd={what ?? ""}
    >
      ••• à compléter{what ? ` : ${what}` : ""}
    </span>
  );
}
