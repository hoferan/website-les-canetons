import { KeyRound } from "lucide-react";

import type { AuthMe200 } from "../api/generated/model";
import { ButtonLink } from "../components/ButtonLink";
import { PageSection } from "../components/PageSection";
import { roleLabel, t } from "../i18n";
import { useSession } from "../session/SessionProvider";

/**
 * Who I am, at /account. The account menu links here.
 *
 * The password is one row with a button, and the form lives on its own page,
 * /account/password (#125). Changing it is a rare act, and a member who opens
 * this page to see who they are logged in as should not be looking at three
 * empty password fields. A committee-issued password never shows this page at
 * all: MustChangePassword sends that member straight to the form.
 *
 * THERE IS NO "DELETE MY ACCOUNT" AND NO PROFILE EDITING. A member's name and
 * register are roster data the committee owns, and a child removing
 * themselves from the band's roster is not a thing this site should offer.
 */
export function Account() {
  const { user } = useSession();

  return (
    <PageSection width="form">
      <h1 className="font-display text-4xl">{t("account.heading")}</h1>

      {user ? <Identity user={user} /> : null}

      <section
        aria-label={t("account.password")}
        className="mt-related flex flex-wrap items-center justify-between gap-related rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
      >
        <div>
          <p className="text-sm text-ink-muted">{t("account.password")}</p>
          {/* Eight dots whatever the length: the page cannot know it, and a
              screen reader has the label and the button already. */}
          <p aria-hidden="true" className="tracking-widest text-ink">
            ••••••••
          </p>
        </div>
        <ButtonLink to="/account/password" variant="outline">
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
