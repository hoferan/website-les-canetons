import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

/**
 * Shows a newly-issued password exactly once (§4.4).
 *
 * AS SELECTABLE TEXT, IN A LARGE MONOSPACE, NOT IN A PASSWORD FIELD. The whole
 * purpose is that an administrator reads it down the phone or hands it over on
 * paper, so masking it would defeat the feature.
 *
 * It is deliberately NOT copied to the clipboard automatically either: a
 * credential sitting silently in the clipboard is worse than one on screen for
 * ten seconds, and this audience reads it aloud rather than pasting it.
 *
 * The dialog says plainly that it will not be shown again, because it will not:
 * the server keeps only the hash.
 *
 * The alphabet it is drawn from has every confusable pair removed — no 0/O, no
 * 1/l/I, no 5/S, no 2/Z (App\Support\GeneratedPassword) — which is what makes
 * dictating it survivable. The monospace and the letter spacing here are the
 * other half of that: proportional text at body size is where "rn" becomes "m".
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
          <AlertDialogTitle>Mot de passe de {memberName}</AlertDialogTitle>
          <AlertDialogDescription>
            Notez-le ou lisez-le à la personne maintenant&nbsp;: il ne sera plus jamais affiché.
            Elle devra le remplacer à sa première connexion.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <p
          data-testid="generated-password"
          className="rounded-md border border-line bg-panel p-4 text-center font-mono text-2xl tracking-widest select-all"
        >
          {password}
        </p>

        <AlertDialogFooter>
          {/* The Radix action, which closes the dialog — correct here: there is
              nothing that can fail, and nothing to read afterwards. */}
          <AlertDialogAction onClick={onClose}>J’ai noté le mot de passe</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
