import type {
  EditableRegistrationOptionResource,
  OptionKind,
  RegistrationOptionResource,
  ReplaceRegistrationOptionsRequestOptionsItem,
} from "../../api/generated/model";
import { francsInput, parseFrancs } from "../../money";

/** One answer of a choice, as typed. */
export type AnswerDraft = {
  /** The server's id, sent back so bookings keep pointing at it; null for a new one. */
  id: string | null;
  label: string;
  /** Some booking picked it, so the server refuses removing it. */
  picked: boolean;
  /** A stable key for React, since a new answer has no id. */
  key: string;
};

/** One block of the editor: an existing one, or one being invented. */
export type Draft = {
  /** Null for a row that does not exist on the server yet. */
  id: number | null;
  /** Fixed once a booking answered it: the server refuses changing its kind. */
  kind: OptionKind;
  label: string;
  /** Help text, or a paragraph's body. */
  description: string;
  required: boolean;
  /** Quantities only. */
  countsGuests: boolean;
  /** Francs as typed, not centimes: see web/src/money.ts. */
  price: string;
  /** Whole places as typed; empty is no limit. */
  capacity: string;
  /** Places still free, as the server last counted; null without a capacity. */
  remaining: number | null;
  /** Choices only. */
  answers: AnswerDraft[];
  /** Some booking answered it, so the server refuses removing it. */
  answered: boolean;
  /** A stable key for React, since a new row has no id. */
  key: string;
};

/** The kinds in the order the block picker offers them. */
export const KINDS: OptionKind[] = ["quantity", "choice", "yes_no", "text", "heading", "paragraph"];

let nextKey = 0;

export function answerDraft(id: string | null, label: string, picked = false): AnswerDraft {
  return { id, label, picked, key: `answer-${nextKey++}` };
}

export function draftFrom(option: EditableRegistrationOptionResource): Draft {
  return {
    id: option.id,
    kind: option.kind,
    label: option.label ?? "",
    description: option.description ?? "",
    required: option.required,
    countsGuests: option.countsGuests,
    price: francsInput(option.priceCents),
    capacity: option.capacity === null ? "" : String(option.capacity),
    remaining: option.remaining,
    answers: option.answers.map((answer) =>
      answerDraft(answer.id, answer.label, option.pickedAnswerIds.includes(answer.id)),
    ),
    answered: option.answered,
    key: `option-${option.id}`,
  };
}

/**
 * Another event's blocks, to start this form from (#319).
 *
 * New rows with new answers: an id would point the PUT at the other event's
 * option, and the server refuses an id that is not this event's. The
 * bookings stay where they are, so nothing here is answered.
 */
export function copiedDrafts(options: EditableRegistrationOptionResource[]): Draft[] {
  return options.map((option) => {
    const draft = draftFrom(option);

    return {
      ...draft,
      id: null,
      remaining: null,
      answered: false,
      answers: draft.answers.map((answer) => answerDraft(null, answer.label)),
      key: `new-${nextKey++}`,
    };
  });
}

export function blankDraft(kind: OptionKind): Draft {
  return {
    id: null,
    kind,
    label: "",
    description: "",
    required: false,
    // A new quantity is a menu until the committee says otherwise, as every
    // option was before the kinds existed.
    countsGuests: kind === "quantity",
    price: "",
    capacity: "",
    remaining: null,
    // Two empty answers, the fewest a choice can have.
    answers: kind === "choice" ? [answerDraft(null, ""), answerDraft(null, "")] : [],
    answered: false,
    key: `new-${nextKey++}`,
  };
}

/** Whether the guest answers this kind, as opposed to only reading it. */
export function isInput(kind: OptionKind): boolean {
  return kind !== "heading" && kind !== "paragraph";
}

/**
 * What the API takes for one row, by kind. Price, capacity and the
 * counts-as-people tick go with a quantity only, and the answers with a
 * choice only: the API refuses them anywhere else.
 */
export function payloadOf(
  row: Draft,
  index: number,
  price: number | null,
  capacity: number | null,
): ReplaceRegistrationOptionsRequestOptionsItem {
  const common: ReplaceRegistrationOptionsRequestOptionsItem = {
    id: row.id,
    kind: row.kind,
    label: row.label.trim() === "" ? null : row.label,
    description: row.description.trim() === "" ? null : row.description,
    sortOrder: index,
  };

  if (!isInput(row.kind)) {
    return common;
  }
  if (row.kind === "quantity") {
    return {
      ...common,
      required: row.required,
      countsGuests: row.countsGuests,
      priceCents: price,
      capacity,
    };
  }
  if (row.kind === "choice") {
    return {
      ...common,
      required: row.required,
      // A blank answer is dropped, as the check before the save already
      // ignores it: sent, the API would refuse its label against a field no
      // row shows.
      answers: row.answers
        .filter((answer) => answer.label.trim() !== "")
        .map((answer) => ({ id: answer.id, label: answer.label })),
    };
  }

  return { ...common, required: row.required };
}

/** Empty is no limit; anything else must be a whole number of at least 1. */
export function parseCapacity(typed: string): number | null | "invalid" {
  const trimmed = typed.trim();

  if (trimmed === "") {
    return null;
  }

  return /^\d+$/.test(trimmed) && Number(trimmed) >= 1 ? Number(trimmed) : "invalid";
}

/**
 * A draft as the guest view renders it, so an open block shows the
 * committee's edit before it is saved. Prices and capacities that do not
 * parse yet show as none.
 */
export function previewOf(row: Draft, id: number): RegistrationOptionResource {
  const price = parseFrancs(row.price);
  const capacity = parseCapacity(row.capacity);

  return {
    id,
    kind: row.kind,
    label: row.label === "" ? null : row.label,
    description: row.description === "" ? null : row.description,
    required: isInput(row.kind) && row.required,
    countsGuests: row.kind === "quantity" && row.countsGuests,
    answers: row.answers
      .filter((answer) => answer.label.trim() !== "")
      .map((answer) => ({ id: answer.id ?? answer.key, label: answer.label })),
    priceCents: row.kind === "quantity" && price !== "invalid" ? price : null,
    capacity: capacity === "invalid" ? null : capacity,
    // The count the server last gave, or the whole capacity for a new block:
    // nobody has booked what is not saved.
    remaining: capacity === "invalid" || capacity === null ? null : (row.remaining ?? capacity),
    sortOrder: 0,
  };
}
