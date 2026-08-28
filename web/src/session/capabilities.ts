/**
 * The capability matrix, mirrored from api/app/Support/Capability.php.
 *
 * NOT a hierarchy, and that is the whole point: admin manages events and views
 * summaries but may NOT respond; user/moderator respond but may not manage. The
 * Team Direction organises events, it does not vote in them.
 *
 * This copy is UX ONLY. Laravel's `capability:` middleware is the sole
 * enforcement, so a mistake here shows the wrong button — it does not open a
 * hole. Keep the two in step anyway: a wrong button is still a bug report.
 */
export const CAPABILITIES = {
  user: ["respond"],
  moderator: ["respond"],
  admin: ["manage_events", "view_summary"],
} as const satisfies Record<string, readonly string[]>;

export type Role = keyof typeof CAPABILITIES;
export type Capability = (typeof CAPABILITIES)[Role][number];

export function can(role: string | null | undefined, capability: Capability): boolean {
  if (!role || !(role in CAPABILITIES)) return false;
  return (CAPABILITIES[role as Role] as readonly string[]).includes(capability);
}
