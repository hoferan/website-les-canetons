import type { ChaseListEntryResource } from "../api/generated/model";
import { t } from "../i18n";

/**
 * An answer as a button reads it. `answerInline` is the same answer inside a
 * sentence.
 *
 * Two strings, never one lowercased: French writes "oui" lowercase inside a
 * sentence, while German keeps its "Ja". Casing belongs to the language, so
 * each locale carries both forms.
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
 * The reason travels with the name: a named "non" with its reason is
 * something the committee can act on, and a count that dropped by one is not.
 *
 * The quotes around the reason are in the catalogue. French sets guillemets
 * with a space inside and Swiss Standard German sets them tight, so composing
 * them here would put French typography on a German page. `note` itself is
 * what a member typed, rendered verbatim in both locales.
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
