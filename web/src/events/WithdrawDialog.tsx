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
 * Taking back a commitment: the one answer that is not one tap (ADR 0018).
 *
 * Only `yes` to `no` costs a reason, because somebody has already planned
 * around that yes. A first "Non" is a tap, and so is turning "Non" into "Oui":
 * a late yes is good news and needs no justifying.
 *
 * It asks for the reason, not "are you sure". Three people typing "malade" in
 * the same week is something the committee can act on, so the field is the
 * whole dialog and the reason is shown beside the name on the chase list.
 *
 * The server enforces it: a blank reason is refused with
 * `validation_failed` against `note`, which lands here through `problem`. The
 * `armed` check below only saves a round trip.
 *
 * Like ConfirmByTypingName, the action is a plain Button, not Radix's
 * AlertDialogAction, which closes the dialog on click: the request can fail
 * and the message has to stay readable next to its field.
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
          {/* The guillemets and the space before the "?" are in the string:
              French sets both with a no-break space and German takes neither.
              `eventTitle` is content and renders verbatim. */}
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
            variant="raised-danger"
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
