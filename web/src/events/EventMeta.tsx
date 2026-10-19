import type { EventTagResource } from "../api/generated/model";
import { t } from "../i18n";
import { TagChip } from "./TagChip";

/**
 * The metadata strip under an event's title.
 *
 * Permission-blind, like EventCard. Every prop is optional and the screen
 * decides which to pass; the API has already withheld what the caller may not
 * see. Given nothing, it renders nothing, so a player's card has no empty row.
 */
export function EventMeta({
  tags,
  isPublic,
  answered,
  answerable,
  guests,
}: {
  tags?: EventTagResource[];
  isPublic?: boolean;
  answered?: number;
  answerable?: number;
  guests?: number;
}) {
  const showsAnswers = answered !== undefined && answerable !== undefined;
  const chips = [(tags ?? []).length > 0, isPublic === true, showsAnswers, guests !== undefined];

  if (!chips.some(Boolean)) {
    return null;
  }

  return (
    <div data-testid="event-meta" className="mt-tight flex flex-wrap gap-tight text-sm">
      {/* First, because they say what the event is; everything after them is
          a fact about it. Everybody sees them, unlike the chips that follow. */}
      {(tags ?? []).map((tag) => (
        <TagChip key={tag.id} tag={tag} />
      ))}

      {isPublic === true ? (
        <span className="rounded-full border border-line bg-panel px-2 py-0.5 text-ink-muted">
          {t("events.meta.public")}
        </span>
      ) : null}

      {showsAnswers ? (
        <span
          className="text-ink-muted"
          /*
           * The plural comes from the catalogue. French counts zero as
           * singular and German does not, so no ternary here can be right in
           * both; i18next picks _one/_other from `count` by the active
           * language's rule.
           */
          aria-label={t("events.meta.answersAria", { count: answered, total: answerable })}
        >
          {t("events.meta.answers", { answered, answerable })}
        </span>
      ) : null}

      {guests !== undefined ? (
        <span className="text-ink-muted">
          {/* Zero is its own key, not a plural form: neither language has a
              `_zero` category, and "Aucune inscription" is not the singular
              of anything. */}
          {guests === 0 ? t("events.meta.noGuests") : t("events.meta.guests", { count: guests })}
        </span>
      ) : null}
    </div>
  );
}
