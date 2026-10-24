import type { RegistrationResource, RegistrationResourceChoicesItem } from "../api/generated/model";
import { t } from "../i18n";
import { formatCents } from "../money";

/** A booking's answers read back, as the confirmation and a member's own answers show them. */
export function AnswersSummary({
  booking,
  countsPeople,
}: {
  booking: RegistrationResource;
  countsPeople: boolean;
}) {
  return (
    <>
      <ul className="mt-tight grid gap-1" data-testid="booking-summary">
        {booking.choices.map((choice) => (
          <li key={choice.optionId}>
            {choice.kind === "quantity"
              ? `${choice.quantity} × ${choice.label}`
              : t("booking.answered", { question: choice.label, answer: answerText(choice) })}
          </li>
        ))}
      </ul>
      {countsPeople || booking.totalCents !== null ? (
        <p className="mt-tight" data-testid="booked-guests">
          {/* Null is not zero: a booking of unpriced options owes an
            unknown amount, not "CHF 0.00". */}
          {booking.totalCents === null
            ? t("common.guests", { count: booking.guestCount })
            : t("booking.guestsWithTotal", {
                guests: t("common.guests", { count: booking.guestCount }),
                total: formatCents(booking.totalCents),
              })}
        </p>
      ) : null}
    </>
  );
}

/** A booked answer as the guest reads it back. */
function answerText(choice: RegistrationResourceChoicesItem): string {
  if (choice.kind === "yes_no") {
    return choice.value === "yes" ? t("booking.yes") : t("booking.no");
  }

  return (choice.kind === "choice" ? choice.answerLabel : choice.value) ?? "";
}
