import { User } from "lucide-react";

/**
 * A member's initials in a violet disc, or a person icon when there is no name
 * to take them from.
 *
 * Decorative: whatever shows the avatar also carries the member's name as
 * text or as an accessible name, so the disc itself is aria-hidden.
 */
export function Avatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const letters = initials(firstName, lastName);

  return (
    <span
      aria-hidden="true"
      className="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-violet text-sm font-semibold text-white"
    >
      {letters === "" ? <User className="size-4" /> : letters}
    </span>
  );
}

/**
 * The first letter of each name, upper-cased. Array.from rather than
 * charAt(0), so a letter outside the BMP is taken whole instead of as half a
 * surrogate pair.
 */
export function initials(firstName: string, lastName: string): string {
  return [firstName, lastName]
    .map((name) => Array.from(name.trim())[0] ?? "")
    .join("")
    .toLocaleUpperCase("fr-CH");
}
