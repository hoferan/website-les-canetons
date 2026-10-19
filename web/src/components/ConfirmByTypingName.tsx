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

import { FormError, FormField } from "./FormField";
import { t, type TranslatedError } from "../i18n";

/**
 * The dialog every destructive privileged action goes through.
 *
 * It keeps two things together so neither gets skipped: `title` and
 * `description` name the person and what will happen to them ("Êtes-vous
 * sûr ?" is a question nobody reads), and the confirmation sits in the same
 * dialog, performed while reading what it authorises.
 *
 * A typed name, not a password (ADR 0017): the session is already trusted for
 * everything else, and what a confirmation guards against is a mis-aimed tap.
 * A name does that better because it names the specific person. The server
 * cannot tell a typed confirmation from an automated one, so this check lives
 * in the browser only and is the only guard on a delete.
 *
 * `confirmPhrase` is optional, decided by what a mis-aimed tap would cost.
 * Deleting a member destroys their whole history, so it asks for the name.
 * Issuing a new password can be done again, and an event deleted a minute
 * after creation costs a minute, so those only ask for a press.
 *
 * The action button is never `disabled`, which would blur focus to <body>
 * mid-submit. `aria-disabled` plus the early return prevents a double submit.
 */
export function ConfirmByTypingName({
  open,
  title,
  description,
  confirmLabel,
  dismissLabel,
  confirmPhrase,
  busy,
  error,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  /**
   * The way out, for when "Annuler" would read as the action itself
   * (cancelling a booking, in French). Defaults to common.cancel.
   */
  dismissLabel?: string;
  /** When given, the action stays inert until this exact text is typed. */
  confirmPhrase?: string;
  busy: boolean;
  error: TranslatedError | null;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");

  const armed = confirmPhrase === undefined || typed.trim() === confirmPhrase;

  function close() {
    // Never leave a typed value in state behind a closed dialog.
    setTyped("");
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
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {confirmPhrase === undefined ? null : (
          <FormField
            id="confirm-phrase"
            label={t("common.typeToConfirm", { phrase: confirmPhrase })}
            value={typed}
            onChange={setTyped}
            autoComplete="off"
          />
        )}

        <FormError error={error} />

        <AlertDialogFooter>
          <AlertDialogCancel onClick={close}>
            {dismissLabel ?? t("common.cancel")}
          </AlertDialogCancel>
          {/*
            A plain Button, not AlertDialogAction, which closes the dialog on
            click: this action can fail (a 409, a server error) and the message
            must stay readable. The caller closes the dialog on success.
          */}
          <Button
            type="button"
            variant="raised-danger"
            aria-disabled={busy || !armed}
            onClick={() => {
              if (busy || !armed) {
                return;
              }
              onConfirm();
            }}
          >
            {busy ? t("common.busy") : confirmLabel}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
