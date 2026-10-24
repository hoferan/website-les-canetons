import { useMemo, useState } from "react";

import type { RegistrationFormResource, RegistrationResource } from "../api/generated/model";

/** The answers a booking form holds, keyed by option id, as typed. */
export type Typed = Record<number, string>;

/**
 * A booking's answers as the form types them, and what they add up to.
 *
 * Shared by the guest's form and a member's (ADR 0034): both send the same
 * `choices`, and the server names a refused line by its position in them.
 */
export function useAnswers(offer: RegistrationFormResource | null) {
  // Keyed by option id. A missing key is none of that option, so an untouched
  // form sends nothing instead of a row of zeroes.
  const [quantities, setQuantities] = useState<Typed>({});
  // Every other answer, keyed the same way: the text, the chosen answer's
  // id, or yes / no. An empty string is no answer and is not sent.
  const [answers, setAnswers] = useState<Typed>({});

  const chosen = useMemo(
    () =>
      (offer?.options ?? [])
        // A sold-out option leaves the booking even if the guest chose it
        // before it sold out: its box is disabled, so it could not be
        // cleared, and every retry would be refused again.
        .filter((option) => option.kind === "quantity" && option.remaining !== 0)
        .map((option) => ({ option, quantity: Number(quantities[option.id] ?? "0") }))
        .filter((line) => Number.isInteger(line.quantity) && line.quantity > 0),
    [offer, quantities],
  );

  // What is sent, in this order: the server names a refused line by its
  // position, `choices.N.quantity` or `choices.N.value`.
  const lines = useMemo(
    () => [
      ...chosen.map((line) => ({ optionId: line.option.id, quantity: line.quantity })),
      ...(offer?.options ?? [])
        .filter((option) => (answers[option.id] ?? "").trim() !== "")
        .map((option) => ({ optionId: option.id, value: answers[option.id] ?? "" })),
    ],
    [chosen, offer, answers],
  );

  // A form with no block that counts people, a picnic list say, has nobody
  // to count and no "choose someone" to say.
  const countsPeople = (offer?.options ?? []).some((option) => option.countsGuests);
  const guests = chosen
    .filter((line) => line.option.countsGuests)
    .reduce((sum, line) => sum + line.quantity, 0);
  const priced = chosen.filter((line) => line.option.priceCents !== null);
  const total = priced.reduce(
    (sum, line) => sum + (line.option.priceCents ?? 0) * line.quantity,
    0,
  );

  /** Fills the form with a booking's answers, to change them. */
  function load(booking: RegistrationResource) {
    const typedQuantities: Typed = {};
    const typedAnswers: Typed = {};

    for (const choice of booking.choices) {
      if (choice.kind === "quantity") {
        typedQuantities[choice.optionId] = String(choice.quantity ?? "");
      } else {
        typedAnswers[choice.optionId] = choice.value ?? "";
      }
    }

    setQuantities(typedQuantities);
    setAnswers(typedAnswers);
  }

  function reset() {
    setQuantities({});
    setAnswers({});
  }

  return {
    quantities,
    setQuantities,
    answers,
    setAnswers,
    lines,
    positionOf: (optionId: number) => lines.findIndex((line) => line.optionId === optionId),
    countsPeople,
    guests,
    priced,
    total,
    load,
    reset,
  };
}

export type Answers = ReturnType<typeof useAnswers>;
