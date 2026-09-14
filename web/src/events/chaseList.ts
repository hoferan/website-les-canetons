import type { ChaseListEntryResource } from "../api/generated/model";

/** The French for an answer, in the one place that decides it. */
export function answerLabel(status: "yes" | "no"): string {
  return status === "yes" ? "Oui" : "Non";
}

/** "Perrine Player", the way a list of people is read. */
export function nameOf(entry: ChaseListEntryResource): string {
  return `${entry.firstName} ${entry.lastName}`;
}

/**
 * Who answered what, as one line of text.
 *
 * The reason travels WITH the name, which is the whole difference between a
 * chase list and a headcount: "Perrine Player — non — « malade »" is something
 * the committee can act on, and a count that dropped by one is not.
 */
export function answerLine(entry: ChaseListEntryResource): string {
  const answer = entry.attendance;
  if (!answer) {
    return `${nameOf(entry)} — sans réponse`;
  }
  const note = answer.note ? ` — « ${answer.note} »` : "";
  return `${nameOf(entry)} — ${answerLabel(answer.status).toLowerCase()}${note}`;
}
