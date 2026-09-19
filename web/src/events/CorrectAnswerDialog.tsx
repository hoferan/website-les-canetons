import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { FormError, FormField } from "../components/FormField";
import { t, type TranslatedError } from "../i18n";

/**
 * Correcting an answer the committee already wrote down.
 *
 * The chase list handled the first answer and nothing after it: somebody who
 * said "non, malade" and then telephoned to say they could come had no way
 * back, and the Raison column was read-only. The endpoint behind this has
 * always been an upsert, so what was missing was a control (#96).
 *
 * A DIALOG RATHER THAN INLINE BUTTONS. The answered rows already carry four
 * facts each, and the phone layout renders them as cards a thumb scrolls
 * through; a pair of answer buttons plus a reason field on every one of them
 * is a wall. One button per row opens this, and the same control serves both
 * layouts — which is also the only way the two cannot drift apart.
 *
 * NO REASON IS REQUIRED, withdrawal included. That is C13: this is the
 * committee writing down what somebody told them, and demanding a reason on
 * another person's behalf puts words in their mouth. C11's rule is for a
 * member taking back their own yes, and this is not that route.
 *
 * Like WithdrawDialog, the action is a plain Button rather than Radix's
 * AlertDialogAction, which closes the dialog on click: the request can be
 * refused and the message has to stay readable beside the field it is about.
 */
export function CorrectAnswerDialog({
  name,
  answer,
  busy,
  error,
  problem,
  onConfirm,
  onCancel,
}: {
  /** Whose answer is being corrected, for the title and the accessible name. */
  name: string;
  /** The answer as it stands, which is what the form starts from. */
  answer: { status: "yes" | "no"; note: string | null };
  busy: boolean;
  error: TranslatedError | null;
  /** The server's message against `note`, when it refused the one sent. */
  problem?: string;
  onConfirm: (status: "yes" | "no", note: string) => void;
  onCancel: () => void;
}) {
  const [status, setStatus] = useState<"yes" | "no">(answer.status);
  const [note, setNote] = useState(answer.note ?? "");

  /**
   * Picking an answer, and what happens to the reason underneath it.
   *
   * A REASON BELONGS TO THE ANSWER IT WAS GIVEN FOR. Leaving "malade" in the
   * field while the answer above it flips to `oui` is how the committee ends
   * up reading a yes that is apparently ill — so changing the answer empties
   * it, and changing back to the stored one puts the stored reason back. The
   * field stays editable either way; this only decides what it starts from.
   */
  function choose(next: "yes" | "no") {
    setStatus(next);
    setNote(next === answer.status ? (answer.note ?? "") : "");
  }

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next) {
          onCancel();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* THE SAME STRING AS THE BUTTON THAT OPENED THIS, so the dialog
              confirms what was clicked rather than paraphrasing it. */}
          <AlertDialogTitle>{t("attendance.correctFor", { name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("attendance.correctDescription", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* BOTH ANSWERS VISIBLE, the current one pressed — the same control as
            the planning, so the committee reads it the way the band does. */}
        <div className="flex flex-wrap gap-tight">
          <Button
            type="button"
            variant={status === "yes" ? "default" : "outline"}
            aria-pressed={status === "yes"}
            onClick={() => choose("yes")}
          >
            {t("attendance.answer.yes")}
          </Button>
          <Button
            type="button"
            variant={status === "no" ? "destructive" : "outline"}
            aria-pressed={status === "no"}
            onClick={() => choose("no")}
          >
            {t("attendance.answer.no")}
          </Button>
        </div>

        <FormField
          id="correct-note"
          label={t("attendance.reason")}
          value={note}
          onChange={setNote}
          as="textarea"
          problem={problem}
        />

        <FormError error={error} />

        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>{t("common.cancel")}</AlertDialogCancel>
          <Button
            type="button"
            aria-disabled={busy}
            onClick={() => {
              if (busy) {
                return;
              }
              onConfirm(status, note.trim());
            }}
          >
            {busy ? t("common.busy") : t("common.save")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
