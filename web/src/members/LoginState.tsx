import { Badge } from "@ds";

import { loginState, type LoginStatusFields } from "./loginStatus";

/**
 * A member's account state on the roster card.
 *
 * Pills carry the call to action and the date carries reference: one muted
 * sentence saying both gets read straight past.
 *
 * The attention tone: somebody should act on it. Not danger, which is for
 * faults, and a member who has not logged in is not one.
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
            <Badge
              key={pill.key}
              tone="attention"
              size="sm"
              data-testid={`member-login-pill-${pill.key}`}
              // The accessible name stands on its own: a screen reader reaches
              // `Provisoire` without the card around it to supply the noun.
              aria-label={pill.accessibleName}
            >
              {pill.label}
            </Badge>
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
