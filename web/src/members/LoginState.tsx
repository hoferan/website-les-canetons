import { loginState, type LoginStatusFields } from "./loginStatus";

/**
 * A member's account state on the roster card (#94).
 *
 * PILLS CARRY THE CALL TO ACTION, the date carries reference. The first
 * version of this was one muted sentence saying both, and the committee read
 * straight past it — which is the entire failure this component exists to fix.
 *
 * SOLID PINK, matching the inbox count badge in Layout.tsx rather than
 * inventing a token. That badge is already this app's "something needs you"
 * affordance, so a second one should speak the same language. `--color-pink`
 * is documented in styles.css as emphasis only, never a whole surface; a pill
 * is emphasis. The text on it is ink, for contrast; styles.css says why.
 * `--color-danger` is NOT borrowed here: it is error-only by
 * construction, and a member who has not logged in is not an error.
 *
 * IT RENDERS NOTHING FOR AN ACCOUNT IN NORMAL USE beyond the date, like
 * EventMeta renders nothing when given nothing. A roster where every row
 * carries a pill is a roster where a pill means nothing.
 */
export function LoginState({ member }: { member: LoginStatusFields }) {
  const { pills, lastLogin } = loginState(member);

  return (
    <div data-testid="member-login-status" className="mt-tight">
      {pills.length > 0 ? (
        <div className="flex flex-wrap gap-tight">
          {pills.map((pill) => (
            <span
              key={pill.key}
              data-testid={`member-login-pill-${pill.key}`}
              // The visible label is the short one; the accessible name is the
              // one that stands on its own, because a screen reader reaches
              // `Provisoire` without the card around it to supply the noun.
              aria-label={pill.accessibleName}
              className="rounded-full bg-pink px-2 py-0.5 text-xs font-semibold text-ink"
            >
              {pill.label}
            </span>
          ))}
        </div>
      ) : null}

      {lastLogin === null ? null : (
        <p className={`text-sm text-ink-muted${pills.length > 0 ? " mt-tight" : ""}`}>
          {lastLogin}
        </p>
      )}
    </div>
  );
}
