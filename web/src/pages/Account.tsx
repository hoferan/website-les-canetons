import { KeyRound } from "lucide-react";

import type { AuthMe200 } from "../api/generated/model";
import { ButtonLink } from "../components/ButtonLink";
import { PageSection } from "../components/PageSection";
import { registerName, roleName, t } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { OUTLINED_CARD } from "../carnival/raised";

/**
 * Who I am, at /account.
 *
 * The password is one row with a button; the form lives on
 * /account/password, because changing it is rare and a member checking who
 * they are logged in as should not face three empty fields.
 * MustChangePassword sends a committee-issued password straight to the form.
 *
 * There is no profile editing and no account deletion: name and register are
 * roster data the committee owns.
 */
export function Account() {
  const { user } = useSession();

  return (
    <PageSection width="form">
      <h1 className="font-display text-4xl">{t("account.heading")}</h1>

      {user ? <Identity user={user} /> : null}

      <section
        aria-label={t("account.password")}
        className={`${OUTLINED_CARD} mt-related flex flex-wrap items-center justify-between gap-related p-4`}
      >
        <div>
          <p className="text-sm text-ink-muted">{t("account.password")}</p>
          {/* Eight dots whatever the length, which the page cannot know.
              Hidden from screen readers, which have the label and button. */}
          <p aria-hidden="true" className="tracking-widest text-ink">
            ••••••••
          </p>
        </div>
        <ButtonLink to="/account/password" variant="raised-light">
          <KeyRound aria-hidden="true" />
          {t("account.change")}
        </ButtonLink>
      </section>
    </PageSection>
  );
}

/**
 * Each label sits above its value, because a seat name like
 * "Vice-présidente - secrétaire" wraps badly beside its label on a phone.
 *
 * Register and seat names are data the committee typed: a register in the
 * page's language when it has a German name, a seat verbatim. Roles go
 * through roleName, the typed name if any, else the catalogue's by key.
 */
function Identity({ user }: { user: AuthMe200 }) {
  const register = user.sectionName;
  const rows = [
    { label: t("account.username"), value: user.username },
    {
      label: t("account.section"),
      value:
        register === null ? t("account.sectionNone") : registerName(register, user.sectionNameDe),
    },
    {
      label: t("account.committeeFunction"),
      value: user.committeeFunctionName ?? t("account.committeeFunctionNone"),
    },
    {
      label: t("account.roles"),
      value: user.roles.length > 0 ? user.roles.map(roleName).join(", ") : t("account.rolesNone"),
    },
  ];

  return (
    <section aria-label={t("account.identity")} className={`${OUTLINED_CARD} mt-block p-4`}>
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
