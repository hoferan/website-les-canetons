import { useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";

import { Button } from "@/components/ui/button";

import { getAuthMeQueryKey, useAccountPassword } from "../api/generated/endpoints";
import type { AuthMe200 } from "../api/generated/model";
import { useApiFormError } from "../api/useApiFormError";
import { FormError, FormField } from "../components/FormField";
import { Notice } from "../components/Notice";
import { PageSection } from "../components/PageSection";
import { roleLabel, t } from "../i18n";
import { useSession } from "../session/SessionProvider";

/**
 * Who I am, and change my own password.
 *
 * The identity card comes first because the account menu links here, and a
 * member who opens it wants to see who they are logged in as before any
 * password field. It is read-only; see below.
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
      <h1 className="font-display text-4xl">{t("account.heading")}</h1>

      {user?.mustChangePassword ? (
        // Why it says anything at all, rather than merely bouncing them: see
        // account.provisionalNotice in i18n/fr.ts.
        <Notice className="mt-related">{t("account.provisionalNotice")}</Notice>
      ) : null}

      {user ? <Identity user={user} /> : null}

      <h2 className="mt-block font-display text-2xl">{t("account.password")}</h2>

      <form onSubmit={submit} className="mt-related flex flex-col gap-related">
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
          required
          autoComplete="new-password"
        />

        <FormField
          id="confirmation"
          label={t("account.confirmPassword")}
          type="password"
          value={confirmation}
          onChange={setConfirmation}
          problem={mismatch ? t("account.mismatch") : undefined}
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
 * Each label sits above its value, because a seat name like
 * "Vice-présidente - secrétaire" wraps badly beside its label on a phone.
 *
 * Register and seat names are data the committee typed, so they are rendered
 * verbatim. Roles are translated by key, as everywhere else.
 */
function Identity({ user }: { user: AuthMe200 }) {
  const rows = [
    { label: t("account.username"), value: user.username },
    { label: t("account.section"), value: user.sectionName ?? t("account.sectionNone") },
    {
      label: t("account.committeeFunction"),
      value: user.committeeFunctionName ?? t("account.committeeFunctionNone"),
    },
    {
      label: t("account.roles"),
      value:
        user.roleKeys.length > 0
          ? user.roleKeys.map((key) => roleLabel(key)).join(", ")
          : t("account.rolesNone"),
    },
  ];

  return (
    <section
      aria-label={t("account.identity")}
      className="mt-block rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
    >
      <h2 className="font-display text-2xl">
        {user.firstName} {user.lastName}
      </h2>
      <dl className="mt-related grid gap-related sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label}>
            <dt className="text-sm text-ink-muted">{row.label}</dt>
            <dd className="text-ink">{row.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
