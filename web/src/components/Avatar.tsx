import { User } from "lucide-react";

/**
 * A member's initials in a violet disc, or a person icon when there is no name
 * to take them from.
 *
 * Decorative: whatever shows the avatar also carries the member's name as
 * text or as an accessible name, so the disc itself is aria-hidden.
 */
export function Avatar({
  firstName,
  lastName,
  size = "md",
}: {
  firstName: string;
  lastName: string;
  size?: "sm" | "md";
}) {
  const letters = initials(firstName, lastName);
  const box = size === "sm" ? "size-7 text-xs" : "size-9 text-sm";

  return (
    <span
      aria-hidden="true"
      className={`${box} inline-flex shrink-0 items-center justify-center rounded-full bg-violet font-semibold text-white`}
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
