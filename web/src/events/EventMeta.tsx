/**
 * The metadata strip under an event's title (#93).
 *
 * PERMISSION-BLIND, like EventCard itself. Every prop is optional and the
 * screen decides which to pass: the API has already withheld what the caller
 * may not see, and this component never asks who is reading.
 *
 * IT RENDERS NOTHING WHEN GIVEN NOTHING, so a player's card grows no empty row.
 */
export function EventMeta({
  isPublic,
  answered,
  answerable,
  guests,
}: {
  isPublic?: boolean;
  answered?: number;
  answerable?: number;
  guests?: number;
}) {
  const showsAnswers = answered !== undefined && answerable !== undefined;
  const chips = [isPublic === true, showsAnswers, guests !== undefined];

  if (!chips.some(Boolean)) {
    return null;
  }

  return (
    <div data-testid="event-meta" className="mt-tight flex flex-wrap gap-tight text-sm">
      {isPublic === true ? (
        <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-ink-muted">
          Public
        </span>
      ) : null}

      {showsAnswers ? (
        <span
          className="text-ink-muted"
          aria-label={`${answered} ${answered === 0 || answered === 1 ? "réponse" : "réponses"} sur ${answerable}`}
        >
          {answered}/{answerable} réponses
        </span>
      ) : null}

      {guests !== undefined ? (
        <span className="text-ink-muted">
          {guests === 0 ? "Aucune inscription" : `${guests} personne${guests > 1 ? "s" : ""}`}
        </span>
      ) : null}
    </div>
  );
}
