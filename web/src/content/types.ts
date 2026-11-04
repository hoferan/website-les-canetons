import { z } from "zod";

import { swissTelHref } from "../lib/contactHref";
import { translated } from "./translated";

/**
 * The block types the SPA knows. The server checks only a block's size and
 * nesting, never its shape: that is these schemas' job, both to check what a
 * read brings back and to type the editors.
 *
 * Each text field is a {@link translated} pair. Numbers, e-mail addresses,
 * street addresses and URLs are plain strings, because they are never
 * translated.
 *
 * A read checks the shape only. Whether a number can be dialled or a link is
 * https is checked by the editor (`forEditor`), because a read that refuses
 * a block shows the shipped content in its place: one odd number from an
 * import would hide the whole block, and an editor opened on the shipped
 * content would then delete the stored one.
 */

/**
 * The pictures a card can carry, each a lucide-react icon (glyphs and names in
 * `editor/IconPicker.tsx`). The first ten are the original set: a stored card
 * keeps its icon, so none is ever renamed or dropped.
 */
export const ICONS = [
  "music",
  "clock",
  "cake",
  "map-pin",
  "phone",
  "users",
  "calendar",
  "star",
  "info",
  "mail",
  "drum",
  "notes",
  "piano",
  "mic",
  "megaphone",
  "party-popper",
  "sparkles",
  "ticket",
  "shirt",
  "bus",
  "car",
  "train",
  "utensils",
  "beer",
  "coffee",
  "gift",
  "heart",
  "smile",
  "baby",
  "camera",
  "image",
  "video",
  "globe",
  "link",
  "euro",
  "trophy",
  "flag",
  "sun",
  "snowflake",
  "house",
  "school",
  "check",
] as const;

/** The carnival colours a card's icon sits on. */
export const TINTS = ["pink", "cyan", "lime", "yellow", "lilac"] as const;

export type Icon = (typeof ICONS)[number];
export type Tint = (typeof TINTS)[number];

/**
 * The picture a network's link wears: a brand mark (`components/social.tsx`),
 * or the generic `link` for any other site.
 */
export const NETWORK_ICONS = [
  "instagram",
  "facebook",
  "flickr",
  "youtube",
  "tiktok",
  "whatsapp",
  "spotify",
  "soundcloud",
  "linkedin",
  "x",
  "link",
] as const;

export type NetworkIcon = (typeof NETWORK_ICONS)[number];

/**
 * Whether a typed phone number can be dialled, by the same rule the page
 * links it with ({@link swissTelHref}): a Swiss number with its 0
 * ("026 123 45 67"), or one with its country code ("+41 26 123 45 67",
 * "+41 (0)26 ...", "0041 26 ..."). Empty is accepted: the row then shows its
 * placeholder.
 */
export function isPhoneNumber(value: string): boolean {
  return value.trim() === "" || swissTelHref(value) !== null;
}

/**
 * Only https: an http link would be a mixed-content warning or a downgrade.
 * A read lets any URL through, so whatever renders one as a link checks it
 * with this first: an imported `javascript:` URL must never become an href.
 */
export function isHttpsUrl(value: string): boolean {
  return /^https:\/\//.test(value);
}

/** The strings an editor checks further than a read does. */
type Checks = {
  phone: z.ZodType<string, string>;
  url: z.ZodType<string, string>;
  name: z.ZodType<string, string>;
};

function schemas(checks: Checks) {
  const textRow = z.object({ type: z.literal("text"), text: translated });

  const labelValueRow = z.object({
    type: z.literal("labelValue"),
    label: translated,
    value: translated,
  });

  // A phone number in its own row, so nothing has to guess a number inside
  // prose. `tbd` is the placeholder's token: a row that ships with no number
  // shows the placeholder until the band types one.
  const phoneRow = z.object({
    type: z.literal("phone"),
    label: translated,
    number: checks.phone,
    tbd: z.string().optional(),
  });

  const emailRow = z.object({ type: z.literal("email"), label: translated, address: z.string() });

  // A street address, shown under its label (the place's name) as a map link.
  const addressRow = z.object({
    type: z.literal("address"),
    label: translated.optional(),
    address: z.string(),
  });

  const linkRow = z.object({ type: z.literal("link"), label: translated, url: checks.url });

  const row = z.discriminatedUnion("type", [
    textRow,
    labelValueRow,
    phoneRow,
    emailRow,
    addressRow,
    linkRow,
  ]);

  // One card of a grid. `id` is stable, so a stored card and the default it
  // replaced can be told apart from a card the band added.
  const card = z.object({
    id: z.string(),
    icon: z.enum(ICONS),
    tint: z.enum(TINTS),
    title: translated,
    rows: z.array(row),
    // A photo slot under the title, keyed by the block and this id (`cardSlot`).
    photo: z.boolean().optional(),
  });

  const cardsBlock = z.object({ cards: z.array(card) });

  // What the header and the footer of every page show. The band's name and
  // legal name are typed once and never translated.
  const siteBlock = z.object({
    name: z.string(),
    pitch: translated,
    legalName: z.string(),
    // Any page the band keeps: the name is typed and never translated.
    networks: z.array(
      z.object({ label: checks.name, url: checks.url, icon: z.enum(NETWORK_ICONS) }),
    ),
  });

  return { row, card, cardsBlock, siteBlock };
}

export const { row, card, cardsBlock, siteBlock } = schemas({
  phone: z.string(),
  url: z.string(),
  name: z.string(),
});

/** The same blocks as an editor saves them: a number dials, a link is https. */
export const forEditor = schemas({
  phone: z.string().refine(isPhoneNumber),
  url: z.string().refine(isHttpsUrl),
  // Spaces alone are no name: the page would drop the entry without a word.
  name: z.string().refine((value) => value.trim() !== ""),
});

export type Row = z.infer<typeof row>;

export type Card = z.infer<typeof card>;

/**
 * A public page's hero: its heading, the words of it set on the yellow
 * highlight, and the paragraph under it on some pages. The highlight shows
 * only while the heading still contains those words.
 */
export const heroBlock = z.object({
  title: translated,
  mark: translated.optional(),
  intro: translated.optional(),
});
