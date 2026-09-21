import { t } from "../i18n";

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
          {t("events.meta.public")}
        </span>
      ) : null}

      {showsAnswers ? (
        <span
          className="text-ink-muted"
          /*
           * THE PLURAL IS THE CATALOGUE'S, NOT THIS COMPONENT'S. This read
           * `answered === 0 || answered === 1 ? "réponse" : "réponses"`, which
           * is the FRENCH plural rule written out in JavaScript: French counts
           * zero as singular and German does not. The same ternary therefore
           * renders "0 Rückmeldung" on a German page, and changing it to
           * `=== 1` would render "0 réponses" on a French one. i18next picks
           * _one/_other from `count` using the active language's own rule, so
           * each locale is right without the other being wrong.
           */
          aria-label={t("events.meta.answersAria", { count: answered, total: answerable })}
        >
          {t("events.meta.answers", { answered, answerable })}
        </span>
      ) : null}

      {guests !== undefined ? (
        <span className="text-ink-muted">
          {/* Zero says something ELSE here, so it is its own key rather than a
              plural form -- neither language has a `_zero` category, and
              "Aucune inscription" is not the singular of anything. */}
          {guests === 0 ? t("events.meta.noGuests") : t("events.meta.guests", { count: guests })}
        </span>
      ) : null}
    </div>
  );
}
