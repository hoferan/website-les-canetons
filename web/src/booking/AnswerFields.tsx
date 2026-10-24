import type { RegistrationFormResource } from "../api/generated/model";
import { t } from "../i18n";
import { formatCents } from "../money";
import { BlockView } from "./BlockView";
import type { Answers } from "./useAnswers";

/**
 * The form's blocks, the refusal for the whole list and the running total:
 * what a guest and a member both fill in.
 */
export function AnswerFields({
  offer,
  form,
  messageFor,
}: {
  offer: RegistrationFormResource;
  form: Answers;
  messageFor: (field: string) => string | undefined;
}) {
  const { quantities, answers, setQuantities, setAnswers, positionOf } = form;

  return (
    <fieldset className="flex flex-col gap-related">
      <legend className="mb-tight heading-wave w-fit font-display text-xl">
        {t("booking.choiceLegend")}
      </legend>

      {offer.options.length === 0 ? (
        <p className="text-ink-muted">{t("booking.nothingOffered")}</p>
      ) : null}

      {offer.options.map((option) => {
        // A required block left out is refused against
        // `answers.<optionId>`, since it has no position in what
        // was sent. Said in a sentence of its own: the generic
        // "<field> est obligatoire" would name the field "Réponses".
        const unanswered = messageFor(`answers.${option.id}`)
          ? t("booking.answerRequired")
          : undefined;

        const quantity = option.kind === "quantity";

        return (
          <BlockView
            key={option.id}
            option={option}
            // The server names the line by its position in what
            // was sent, `choices.N.quantity` or `choices.N.value`,
            // not by option id.
            problem={
              messageFor(`choices.${positionOf(option.id)}.${quantity ? "quantity" : "value"}`) ??
              unanswered
            }
            value={(quantity ? quantities : answers)[option.id] ?? ""}
            onChange={(value) =>
              (quantity ? setQuantities : setAnswers)((current) => ({
                ...current,
                [option.id]: value,
              }))
            }
          />
        );
      })}

      {/* The refusal for the whole list lands on `choices`, as the
        server sends it: no single quantity is wrong when the sum
        is. */}
      {messageFor("choices") ? (
        <span className="text-sm text-danger" role="alert">
          {messageFor("choices")}
        </span>
      ) : null}

      {/* The running total, which is why prices travel as integers:
        a guest reads what a choice costs before submitting. */}
      {form.countsPeople ? (
        <p className="text-ink" data-testid="booking-total">
          {/* The count's plural comes from the catalogue: `guests > 1`
            is the French rule, and wrong for "0 Person" in German. */}
          {form.guests === 0
            ? t("booking.chooseSomeone")
            : form.priced.length === 0
              ? t("common.guests", { count: form.guests })
              : t("booking.guestsWithTotal", {
                  guests: t("common.guests", { count: form.guests }),
                  total: formatCents(form.total),
                })}
        </p>
      ) : form.priced.length > 0 ? (
        <p className="text-ink" data-testid="booking-total">
          {formatCents(form.total)}
        </p>
      ) : null}
    </fieldset>
  );
}
