import type { MemberResource } from "../api/generated/model";
import { t } from "../i18n";
import { formatLastLogin } from "../lib/date";

/**
 * The two fields the state is derived from, and nothing else.
 *
 * Pick rather than the whole resource, so a test needs two fields instead of a
 * fixture member, and a third dependency has to show up in this type.
 */
export type LoginStatusFields = Pick<MemberResource, "mustChangePassword" | "lastLoginAt">;

/**
 * One thing the committee may have to act on.
 *
 * `accessibleName` exists because the short label does not always stand on
 * its own: a screen reader reaches `Provisoire` with no card around it to
 * supply the noun.
 */
export type LoginPill = {
  key: "never-used" | "provisional";
  label: string;
  accessibleName: string;
};

export type LoginState = {
  /** Empty for an account in normal use. That emptiness is the signal. */
  pills: LoginPill[];
  /** Plain reference text, or null where there has been no login to report. */
  lastLogin: string | null;
};

/**
 * Whether this person can actually log in, and whether they ever have.
 *
 * Split by what each fact is for. A state somebody must chase is a pill; a
 * date nobody has to act on is reference text beneath it. An account in
 * normal use raises nothing, so a pill keeps meaning "look here".
 *
 * `Jamais utilisé` comes first because it may mean the credential never
 * reached the person; `Provisoire` beside it says the committee still holds
 * it.
 *
 * No participle agrees with the member. `Jamais connecté` would have to, and
 * the codebase has no inclusive-writing convention; `utilisé` agrees with
 * `le compte`.
 *
 * There is no "never issued" state: members.password is NOT NULL and
 * MemberController::store() generates one for every new member. Everybody has
 * a credential; the question is whose it is.
 */
export function loginState(member: LoginStatusFields): LoginState {
  const pills: LoginPill[] = [];

  if (member.lastLoginAt === null) {
    pills.push({
      key: "never-used",
      label: t("members.neverUsed"),
      accessibleName: t("members.neverUsedName"),
    });
  }

  if (member.mustChangePassword) {
    pills.push({
      key: "provisional",
      label: t("members.provisional"),
      accessibleName: t("members.provisionalName"),
    });
  }

  return {
    pills,
    lastLogin:
      member.lastLoginAt === null
        ? null
        : // formatLastLogin is locale-aware but the preposition around it is
          // not, so the whole sentence comes from the catalogue.
          t("members.lastLogin", { date: formatLastLogin(member.lastLoginAt) }),
  };
}
