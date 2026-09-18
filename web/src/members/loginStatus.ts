import type { MemberResource } from "../api/generated/model";
import { formatLastLogin } from "../lib/date";

/**
 * The two fields the status is derived from, and nothing else.
 *
 * Pick rather than the whole resource, so a test needs two fields rather than
 * a fixture member — and so nothing here can quietly start depending on a
 * third field without saying so in this type.
 */
export type LoginStatusFields = Pick<MemberResource, "mustChangePassword" | "lastLoginAt">;

/**
 * Whether this person can actually log in, and whether they ever have.
 *
 * FOUR OUTCOMES, NOT THREE. The tempting collapse is to let the provisional
 * password win outright and drop the date with it. It merges two rows that
 * want different things: a password never used may never have reached the
 * person at all, and one already used means they are in and have not finished.
 *
 * The issue this comes from (#94) asks for a "never issued" state as well.
 * There is no such state: 2026_09_08_000001_require_member_credentials made
 * members.password NOT NULL and MemberController::store() generates one for
 * every new member. Everybody has a credential; the question is whose it is.
 */
export function loginStatus(member: LoginStatusFields): string {
  const connection =
    member.lastLoginAt === null
      ? "Aucune connexion"
      : `Dernière connexion le ${formatLastLogin(member.lastLoginAt)}`;

  return member.mustChangePassword ? `${connection}, mot de passe provisoire` : connection;
}
