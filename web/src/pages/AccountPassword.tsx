import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Circle, CircleCheck } from "lucide-react";
import { useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { getAuthMeQueryKey, useAccountPassword } from "../api/generated/endpoints";
import { MIN_PASSWORD_LENGTH } from "../api/passwordPolicy";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";
import { Notice } from "../components/Notice";
import { PageSection } from "../components/PageSection";
import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";

/**
 * Change my own password, at /account/password.
 *
 * A page of its own rather than a dialog over /account (#125), because of the
 * forced change: a committee-issued password arrives with must_change_password
 * set, and MustChangePassword holds the member here until it is replaced. A
 * dialog would have to open by itself and refuse to close; a route needs no
 * focus trap, survives Back, and can be named when the committee tells somebody
 * where to go. So the page works as both the routine screen and the one you
 * cannot leave, and the difference is one notice and the missing back link.
 */
export function AccountPassword() {
  const { user } = useSession();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [mismatch, setMismatch] = useState(false);
  const [done, setDone] = useState(false);

  const matches = confirmation !== "" && confirmation === newPassword;

  const queryClient = useQueryClient();
  const change = useAccountPassword();
  const { error, setFromThrown, clear, messageFor } = useApiFormError(t("account.changeFailed"));

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
      {/* No way back while the gate holds them: the link would only bounce
          off MustChangePassword and land here again. */}
      {user?.mustChangePassword ? null : (
        <Link
          to="/account"
          className="inline-flex min-h-touch items-center gap-tight text-sm text-ink-muted hover:text-ink"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          {t("account.heading")}
        </Link>
      )}

      <h1 className="font-display text-4xl">{t("account.password")}</h1>

      {user?.mustChangePassword ? (
        // Why it says anything at all, rather than merely bouncing them: see
        // account.provisionalNotice in i18n/fr.ts.
        <Notice className="mt-related">{t("account.provisionalNotice")}</Notice>
      ) : null}

      <form onSubmit={submit} className="mt-block flex flex-col gap-related">
        <FormField
          id="currentPassword"
          label={t("account.currentPassword")}
          type="password"
          value={currentPassword}
          onChange={setCurrentPassword}
          problem={messageFor("currentPassword")}
          required
          autoComplete="current-password"
        />

        <FormField
          id="newPassword"
          label={t("account.newPassword")}
          type="password"
          value={newPassword}
          onChange={setNewPassword}
          problem={messageFor("newPassword")}
          hint={
            <Check met={newPassword.length >= MIN_PASSWORD_LENGTH}>
              {t("account.rule", { min: MIN_PASSWORD_LENGTH })}
            </Check>
          }
          required
          autoComplete="new-password"
        />

        <FormField
          id="confirmation"
          label={t("account.confirmPassword")}
          type="password"
          value={confirmation}
          onChange={setConfirmation}
          // A mismatch reported on submit stops being true the moment the two
          // agree, and saying both at once would contradict itself.
          problem={mismatch && !matches ? t("account.mismatch") : undefined}
          hint={matches ? <Check met>{t("account.matches")}</Check> : undefined}
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
          {done ? <p className="text-ink-muted">{t("account.changed")}</p> : null}
        </div>

        <Button type="submit" aria-disabled={change.isPending}>
          {change.isPending ? t("account.changing") : t("account.change")}
        </Button>
      </form>
    </PageSection>
  );
}

/**
 * One line under a field that is either satisfied or not yet (#101).
 *
 * Neither state is an error, so nothing here is red: an unmet rule is muted
 * text beside an empty circle, a met one is full ink beside a tick. The palette
 * has no green, and one hint does not earn one. The tick is an icon, so a
 * screen reader gets `ruleMet` in words instead.
 */
function Check({ met, children }: { met: boolean; children: ReactNode }) {
  const Icon = met ? CircleCheck : Circle;
  return (
    <span data-met={met} className={cn("inline-flex items-center gap-1.5", met && "text-ink")}>
      <Icon aria-hidden="true" className={cn("size-4 shrink-0", met && "text-violet")} />
      {children}
      {met ? <span className="sr-only">{`, ${t("account.ruleMet")}`}</span> : null}
    </span>
  );
}
