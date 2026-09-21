import type { MemberResource } from "../api/generated/model";
import { t } from "../i18n";
import { formatLastLogin } from "../lib/date";

/**
 * The two fields the state is derived from, and nothing else.
 *
 * Pick rather than the whole resource, so a test needs two fields rather than
 * a fixture member — and so nothing here can quietly start depending on a
 * third field without saying so in this type.
 */
export type LoginStatusFields = Pick<MemberResource, "mustChangePassword" | "lastLoginAt">;

/**
 * One thing the committee may have to act on.
 *
 * `accessibleName` exists because the shortest label that scans is not always
 * a phrase that stands on its own: a screen reader reaches `Provisoire` with
 * no card around it to supply the missing noun.
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
 * SPLIT BY WHAT THE FACT IS FOR, not by which field it came from. This started
 * as one sentence carrying both facts, and read as prose among prose: true,
 * and overlooked (#94). A state somebody must chase is a pill; a date nobody
 * has to act on is reference text beneath it. So an account in normal use
 * raises nothing at all, and a pill keeps meaning "look here" — which it stops
 * meaning the moment every row has one.
 *
 * ORDER IS DELIBERATE. `Jamais utilisé` comes first because it is the one that
 * may mean the credential never reached the person; `Provisoire` beside it
 * says the committee still holds it.
 *
 * NO PARTICIPLE AGREES WITH THE MEMBER. `Jamais connecté` would have to, and
 * this codebase has no inclusive-writing convention to reach for; `utilisé`
 * agrees with `le compte` instead.
 *
 * The issue this comes from (#94) asks for a "never issued" state as well.
 * There is no such state: 2026_09_08_000001_require_member_credentials made
 * members.password NOT NULL and MemberController::store() generates one for
 * every new member. Everybody has a credential; the question is whose it is.
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
        : // formatLastLogin is already locale-aware (#151); the preposition
          // around it is not, so the whole sentence comes from the catalogue.
          t("members.lastLogin", { date: formatLastLogin(member.lastLoginAt) }),
  };
}
