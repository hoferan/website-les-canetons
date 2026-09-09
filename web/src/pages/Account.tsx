import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import { getAuthMeQueryKey, useAccountPassword } from "../api/generated/endpoints";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";
import { PageSection } from "../components/PageSection";
import { useSession } from "../session/SessionProvider";

/**
 * Change my own password.
 *
 * The only screen every account holder needs and nobody administers. It is also
 * where every FIRST login lands, because a committee-issued password arrives
 * with must_change_password set — so the page has to work as both the routine
 * screen and the one you cannot leave. The difference is one notice.
 *
 * THERE IS NO "DELETE MY ACCOUNT" AND NO PROFILE EDITING. A member's name and
 * register are roster data the committee owns (§4), and a child removing
 * themselves from the band's roster is not a thing this site should offer.
 */
export function Account() {
  const { user } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);

  const queryClient = useQueryClient();
  const change = useAccountPassword();
  const { error, setFromThrown, clear, messageFor } = useApiFormError(
    "Le changement de mot de passe a échoué.",
  );

  async function submit(event: FormEvent) {
    event.preventDefault();

    // aria-disabled, not disabled — so this early return is what actually
    // prevents a double submit.
    if (change.isPending) {
      return;
    }

    clear();
    setDone(false);

    // Client-side, deliberately: the API has no confirmation field, so there is
    // no token to translate — and a typo here costs no round-trip and burns no
    // re-authentication attempt against the throttle.
    if (newPassword !== confirmation) {
      setMismatch(true);
      return;
    }
    setMismatch(false);

    try {
      await change.mutateAsync({ data: { currentPassword, newPassword } });
    } catch (thrown) {
      setFromThrown(thrown);
      // Only the passwords are cleared: whatever was wrong, retyping all three
      // is the honest cost, and leaving a rejected value in the box invites
      // pressing the button again unchanged.
      setCurrentPassword("");
      setNewPassword("");
      setConfirmation("");
      return;
    }

    setCurrentPassword("");
    setNewPassword("");
    setConfirmation("");
    setDone(true);

    // mustChangePassword has just flipped, and MustChangePassword reads it — so
    // the session must be refetched or the member stays trapped on this page
    // after succeeding.
    await queryClient.invalidateQueries({ queryKey: getAuthMeQueryKey() });
  }

  return (
    <PageSection width="form">
      <h1 className="font-display text-4xl">Mon compte</h1>

      {user?.mustChangePassword ? (
        // Explained rather than merely enforced: a member bounced back here by
        // the gate with no reason given would think the site was broken.
        <p className="mt-related rounded-md border border-line bg-panel p-3">
          Votre mot de passe a été fourni par le comité et doit être remplacé avant de continuer.
        </p>
      ) : null}

      <form onSubmit={submit} className="mt-block flex flex-col gap-related">
        <FormField
          id="currentPassword"
          label="Mot de passe actuel"
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          problem={messageFor("currentPassword")}
          required
          autoComplete="current-password"
        />

        <FormField
          id="newPassword"
          label="Nouveau mot de passe"
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          problem={messageFor("newPassword")}
          required
          autoComplete="new-password"
        />

        <FormField
          id="confirmation"
          label="Confirmer le nouveau mot de passe"
          type="password"
          value={confirmation}
          onChange={setConfirmation}
          problem={mismatch ? "Les deux mots de passe ne correspondent pas." : undefined}
          required
          autoComplete="new-password"
        />

        <FormError error={error} />

        {/*
          Always in the tree, never conditionally inserted — the same reasoning
          as FormError's alert region: a live region added to the DOM in the
          same commit as other churn is announced by some browser/AT pairs and
          missed by others.
        */}
        <div role="status">
          {done ? <p className="text-ink-muted">Votre mot de passe a été changé.</p> : null}
        </div>

        <Button type="submit" aria-disabled={change.isPending}>
          {change.isPending ? "Changement…" : "Changer le mot de passe"}
        </Button>
      </form>
    </PageSection>
  );
}
