import type { ChaseListEntryResource } from "../api/generated/model";
import { t } from "../i18n";

/**
 * An answer as a BUTTON reads it, and as a SENTENCE reads it.
 *
 * TWO STRINGS, NOT ONE LOWERCASED. This was `answerLabel(status).toLowerCase()`
 * until German arrived, which is grammar written in code: it is right in
 * French, where "oui" is lowercase inside a sentence, and wrong in German,
 * where the answer stands as a value beside a name and keeps its "Ja". Casing
 * is a property of a language, so each locale carries both forms and neither
 * derives one from the other.
 */
export function answerLabel(status: "yes" | "no"): string {
  return t(status === "yes" ? "attendance.answer.yes" : "attendance.answer.no");
}

/** The same answer, as it reads inside `answerLine` below. */
export function answerInline(status: "yes" | "no"): string {
  return t(status === "yes" ? "attendance.answer.yesInline" : "attendance.answer.noInline");
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
 *
 * THE QUOTES AROUND THE REASON ARE IN THE CATALOGUE, not glued on here. French
 * sets guillemets with a space inside and Swiss Standard German sets them
 * tight, so composing them in this file would put French typography on a
 * German page — the same bug as the Tbd separator (#152). `note` itself is
 * what a member typed: content, rendered verbatim in both locales.
 */
export function answerLine(entry: ChaseListEntryResource): string {
  const answer = entry.attendance;
  const name = nameOf(entry);

  if (!answer) {
    return t("attendance.lineSilent", { name });
  }

  const inline = answerInline(answer.status);

  return answer.note
    ? t("attendance.lineWithNote", { name, answer: inline, note: answer.note })
    : t("attendance.line", { name, answer: inline });
}
