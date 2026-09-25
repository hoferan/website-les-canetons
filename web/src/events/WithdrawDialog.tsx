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

import { FormError, FormField, RequiredLegend } from "../components/FormField";
import { t, type TranslatedError } from "../i18n";

/**
 * Taking back a commitment: the one answer that is not one tap (C11).
 *
 * ONE TRANSITION COSTS A REASON, and only one. Saying "Non" to an event nobody
 * counted on is a tap, and so is changing a "Non" into a "Oui" — saying yes
 * late is good news, and asking a 13-year-old to justify it is friction that
 * buys nothing. `yes` -> `no` opens this dialog because it is the transition
 * somebody has already planned around.
 *
 * IT ASKS FOR THE REASON, IT DOES NOT ASK "ARE YOU SURE". Three people typing
 * "malade" in the same week is information the committee can act on; a count
 * that dropped by one is not. So the field is the whole dialog, and the answer
 * it collects is shown beside the name on the chase list.
 *
 * THE SERVER IS WHAT ENFORCES IT, not this component. A blank reason comes back
 * as an ordinary `400 validation_failed` against `note`, which lands here
 * through `problem` — the same path every other form in the app uses. The
 * client-side `armed` check below only spares the member a round trip; deleting
 * it changes nothing about what can be stored.
 *
 * Like ConfirmByTypingName, the action is a plain Button rather than Radix's
 * AlertDialogAction, which closes the dialog on click: this request can fail
 * and the message has to be readable next to the field it is about.
 */
export function WithdrawDialog({
  open,
  eventTitle,
  busy,
  error,
  problem,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  eventTitle: string;
  busy: boolean;
  error: TranslatedError | null;
  /** The server's message against `note`, when it refused a blank one. */
  problem?: string;
  onConfirm: (note: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");

  const armed = note.trim() !== "";

  function close() {
    setNote("");
    onCancel();
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          close();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          {/* THE GUILLEMETS AND THE SPACE BEFORE THE "?" ARE IN THE STRING.
              French sets both with a no-break space inside and German takes
              neither, so composing them here would put French typography on a
              German page. `eventTitle` is content and renders verbatim. */}
          <AlertDialogTitle>
            {t("attendance.withdrawTitle", { title: eventTitle })}
          </AlertDialogTitle>
          <AlertDialogDescription>{t("attendance.withdrawDescription")}</AlertDialogDescription>
        </AlertDialogHeader>

        <RequiredLegend />
        <FormField
          id="withdraw-note"
          label={t("attendance.reason")}
          value={note}
          onChange={setNote}
          as="textarea"
          required
          problem={problem}
        />

        <FormError error={error} />

        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>{t("common.cancel")}</AlertDialogCancel>
          <Button
            type="button"
            variant="destructive"
            aria-disabled={busy || !armed}
            onClick={() => {
              if (busy || !armed) {
                return;
              }
              onConfirm(note.trim());
            }}
          >
            {busy ? t("common.busy") : t("attendance.withdrawConfirm")}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
