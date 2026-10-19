/**
 * Normalises a post-login destination to a safe in-app path.
 *
 * The SPA passes the attempted location through router state, which never
 * appears in a URL and is set only by this application, so an open redirect
 * cannot arise there today.
 *
 * The rule is an allowlist: the first character must be `/` and the second
 * neither `/` nor `\`. That admits "/planning_repet" and refuses "//evil.com",
 * "/\evil.com" (browsers normalise the backslash), "https://evil.com" and
 * "javascript:alert(1)" without enumerating them.
 *
 * React Router's navigate() would land a hostile value on the 404 view rather
 * than off-site, so this is defence in depth, kept because the next caller may
 * hand the value to `location`.
 */
export function safeReturnTo(raw: unknown): string {
  if (typeof raw !== "string") return "/";
  if (raw[0] !== "/") return "/";
  if (raw[1] === "/" || raw[1] === "\\") return "/";
  return raw;
}
