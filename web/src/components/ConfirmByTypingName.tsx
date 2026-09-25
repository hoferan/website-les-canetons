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
 * TWO THINGS IT REFUSES TO SEPARATE, because separating them is how each gets
 * skipped:
 *
 *   - NAMING THE DAMAGE. "Êtes-vous sûr ?" is a question nobody reads. `title`
 *     and `description` carry the person's actual name and what will happen to
 *     them: no destructive action without naming the damage.
 *   - THE CONFIRMATION ITSELF, in the same dialog as the warning, so it is
 *     performed while reading what it authorises rather than as a separate step
 *     that becomes muscle memory.
 *
 * WHY TYPING A NAME AND NOT A PASSWORD. Until 2026-09-08 (ADR 0017) this
 * dialog took the actor's password and the server verified it. The server no
 * longer does: the session cookie is already trusted to read the whole roster
 * and edit anyone, so re-authentication was an extra lock on three doors out of
 * seventeen. What it actually bought was protection against a mis-aimed tap —
 * and a typed name buys that better, because it names the specific person while
 * a password prompt is the same prompt every time. A server cannot tell a typed
 * confirmation from an automated one, which is why GitHub enforces this in the
 * browser only, and why this is now the ONLY guard on a delete.
 *
 * `confirmPhrase` is optional, and what decides it is what the action costs if
 * it was a mis-aimed tap. Deleting a member destroys their whole history, so
 * it asks for the name. Issuing a new password can simply be done again, and
 * deleting an event the committee mistyped a minute ago costs them the minute
 * — both name the damage and ask for a press. Typing a title back would be
 * friction with nothing behind it.
 *
 * It lives in components/ rather than members/ because it has a second
 * consumer: the planning deletes events through it. One dialog, because the
 * two halves above are exactly what a second one would separate.
 *
 * The action button is never `disabled` — that would blur focus to <body>
 * mid-submit. `aria-disabled` plus the early return in the handler is what
 * prevents a double submit.
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
            A plain Button, NOT AlertDialogAction: the Radix action closes the
            dialog on click, and this action can fail — a 409 invariant, or a
            server error — so the message has to be readable where it happened.
            The caller closes the dialog on success.
          */}
          <Button
            type="button"
            variant="destructive"
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
