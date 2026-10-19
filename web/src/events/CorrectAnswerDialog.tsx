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
 * Correcting an answer the committee already wrote down, for somebody who
 * said "non, malade" and then telephoned to say they could come. The endpoint
 * behind it is an upsert.
 *
 * A dialog, because each answered card already carries four facts, and answer
 * buttons plus a reason field on every one would be a wall to scroll through.
 * One button per card opens this.
 *
 * No reason is required, withdrawal included (ADR 0018): the committee is
 * writing down what somebody told them, and demanding a reason on another
 * person's behalf puts words in their mouth.
 *
 * Like WithdrawDialog, the action is a plain Button, not Radix's
 * AlertDialogAction, which closes the dialog on click: the request can be
 * refused and the message has to stay readable beside its field.
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
   * A reason belongs to the answer it was given for, or the committee reads a
   * yes that is apparently ill. Changing the answer empties the field, and
   * changing back to the stored one restores the stored reason. The field
   * stays editable; this only decides what it starts from.
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
          {/* The same string as the button that opened this, so the dialog
              confirms what was clicked. */}
          <AlertDialogTitle>{t("attendance.correctFor", { name })}</AlertDialogTitle>
          <AlertDialogDescription>
            {t("attendance.correctDescription", { name })}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {/* Both answers visible, the current one pressed: the same control as
            the planning, so the committee reads it the way the band does. */}
        <div className="flex flex-wrap gap-tight">
          <Button
            type="button"
            variant={status === "yes" ? "raised-violet" : "raised-light"}
            aria-pressed={status === "yes"}
            onClick={() => choose("yes")}
          >
            {t("attendance.answer.yes")}
          </Button>
          <Button
            type="button"
            variant={status === "no" ? "raised-danger" : "raised-light"}
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
