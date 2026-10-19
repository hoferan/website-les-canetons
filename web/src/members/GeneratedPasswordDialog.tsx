import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { t } from "../i18n";

/**
 * Shows a newly-issued password exactly once (ADR 0016).
 *
 * As selectable text in a large monospace, not a password field: an
 * administrator reads it down the phone or hands it over on paper.
 *
 * Not copied to the clipboard automatically: a credential sitting silently in
 * the clipboard is worse than one on screen, and this audience reads it aloud.
 *
 * The dialog says it will not be shown again; the server keeps only the hash.
 *
 * The alphabet has the confusable characters removed (no 0/o, 1/l/i, 5/s or
 * 2/z; App\Support\GeneratedPassword), and the monospace and letter spacing
 * here do the rest: proportional text at body size is where "rn" becomes "m".
 */
export function GeneratedPasswordDialog({
  password,
  memberName,
  onClose,
}: {
  password: string | null;
  memberName: string;
  onClose: () => void;
}) {
  return (
    <AlertDialog
      open={password !== null}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t("members.generatedTitle", { name: memberName })}</AlertDialogTitle>
          <AlertDialogDescription>{t("members.generatedDescription")}</AlertDialogDescription>
        </AlertDialogHeader>

        <p
          data-testid="generated-password"
          className="rounded-md border border-line bg-panel p-4 text-center font-mono text-2xl tracking-widest select-all"
        >
          {password}
        </p>

        <AlertDialogFooter>
          {/* The Radix action, which closes the dialog: nothing here can
              fail. */}
          <AlertDialogAction onClick={onClose}>{t("members.generatedAck")}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
