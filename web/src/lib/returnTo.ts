/**
 * Normalises a post-login destination to a safe in-app path.
 *
 * The SPA passes the attempted location through router STATE, which never
 * appears in a URL and is set only by this application — so the open-redirect
 * attack the old page defended against does not arise there. This helper also
 * accepts a legacy `?returnTo=` query, though, because links carrying one are
 * already in the wild, and that one IS attacker-suppliable.
 *
 * The rule is deliberately a whitelist rather than a blacklist: the first
 * character must be `/` and the second must be neither `/` nor `\`. That admits
 * "/planning_repet" and refuses "//evil.com", "/\evil.com" (browsers normalise
 * the backslash), "https://evil.com" and "javascript:alert(1)" without any of
 * them needing to be enumerated.
 *
 * React Router's navigate() would treat a hostile value as an in-app path and
 * land on the 404 view rather than follow it off-site, so this is defence in
 * depth rather than the live hole the old page had. Keep it anyway — the next
 * caller may hand the value to `location`.
 */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (raw[0] !== "/") return "/";
  if (raw[1] === "/" || raw[1] === "\\") return "/";
  return raw;
}
