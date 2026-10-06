import type { TagColour } from "../api/generated/model";

/**
 * The Tailwind classes for each tag colour, written out whole because
 * Tailwind only generates a class it can find as a literal in the source.
 * Building `bg-tag-${colour}` at runtime would compile to nothing.
 *
 * Keyed by the generated enum, so a colour added to App\Support\TagColour
 * fails the typecheck here until it has a pair.
 */
export const TAG_COLOURS: Record<TagColour, string> = {
  violet: "bg-tag-violet text-tag-violet-ink",
  teal: "bg-tag-teal text-tag-teal-ink",
  amber: "bg-tag-amber text-tag-amber-ink",
  pink: "bg-tag-pink text-tag-pink-ink",
  blue: "bg-tag-blue text-tag-blue-ink",
  green: "bg-tag-green text-tag-green-ink",
  coral: "bg-tag-coral text-tag-coral-ink",
  gray: "bg-tag-gray text-tag-gray-ink",
};
