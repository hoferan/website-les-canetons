import { t } from "../i18n";

/**
 * The `suspectFields` tokens this screen knows how to name.
 *
 * Listed rather than derived so the template literal below stays a valid
 * `TranslationKey`. A token the API adds later shows as it came until it
 * gets a key in both catalogues.
 */
const FIELDS = [
  "firstName",
  "lastName",
  "address",
  "tableName",
  "answers",
  "subject",
  "message",
] as const;

function fieldName(field: string): string {
  return (FIELDS as readonly string[]).includes(field)
    ? t(`suspect.fields.${field as (typeof FIELDS)[number]}`)
    : field;
}

/**
 * The red pill beside a flagged booking's or message's name (#332). Nothing
 * for a clean one. The word agrees with what it flags in French.
 */
export function SuspectBadge({ kind, flagged }: { kind: "booking" | "message"; flagged: boolean }) {
  if (!flagged) {
    return null;
  }

  return (
    <span
      data-testid="suspect-badge"
      className="rounded-full border-2 border-danger bg-danger px-2 text-xs font-semibold text-white"
    >
      {t(`suspect.${kind}`)}
    </span>
  );
}

/**
 * Why it was flagged, and on a booking, that its confirmation is still held.
 * Text, not only colour, so the reason reaches a screen reader too.
 */
export function SuspectReasons({
  fields,
  mailHeld = false,
}: {
  fields: string[];
  mailHeld?: boolean;
}) {
  if (fields.length === 0) {
    return null;
  }

  return (
    <p data-testid="suspect-reasons" className="text-sm text-danger">
      {t("suspect.reasons", { fields: fields.map(fieldName).join(", ") })}
      {mailHeld ? ` ${t("suspect.mailHeld")}` : null}
    </p>
  );
}
