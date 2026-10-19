import { loginState, type LoginStatusFields } from "./loginStatus";

/**
 * A member's account state on the roster card.
 *
 * Pills carry the call to action and the date carries reference: one muted
 * sentence saying both gets read straight past.
 *
 * Solid pink, like the inbox count badge in Layout.tsx, which is already the
 * app's "something needs you" mark. `--color-pink` is emphasis only, never a
 * whole surface, and a pill is emphasis; the text on it is ink for contrast
 * (styles.css says why). `--color-danger` is error-only, and a member who has
 * not logged in is not an error.
 *
 * An account in normal use shows only the date. If every row carried a pill,
 * a pill would mean nothing.
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
              // The accessible name stands on its own: a screen reader reaches
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
