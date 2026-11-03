import { z } from "zod";

import { translated } from "./translated";

/**
 * The block types the SPA knows. The server checks only a block's size and
 * nesting, never its shape: that is these schemas' job, both to check what a
 * read brings back and to type the editors.
 *
 * Each text field is a {@link translated} pair. Numbers, e-mail addresses,
 * street addresses and URLs are plain strings, because they are never
 * translated.
 */

/** The pictures a card can carry, each a lucide-react icon by its own name. */
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
] as const;

/** The carnival colours a card's icon sits on. */
export const TINTS = ["pink", "cyan", "lime", "yellow", "lilac"] as const;

export type Icon = (typeof ICONS)[number];
export type Tint = (typeof TINTS)[number];

/** Only https: an http link would be a mixed-content warning or a downgrade. */
const httpsUrl = z.string().regex(/^https:\/\//);

const textRow = z.object({ type: z.literal("text"), text: translated });

const labelValueRow = z.object({
  type: z.literal("labelValue"),
  label: translated,
  value: translated,
});

/**
 * Whether a typed phone number can be dialled: a Swiss number written the way
 * people write it ("026 123 45 67", "+41 26 123 45 67", "0041 26 ...") or any
 * international one, so 9 to 15 digits once spaces, dots, slashes, dashes and
 * brackets are set aside. Empty is accepted: the row then shows its
 * placeholder.
 */
export function isPhoneNumber(value: string): boolean {
  const compact = value.replace(/[\s./()-]/g, "");
  return compact === "" || /^(?:\+|00)?\d{9,15}$/.test(compact);
}

/**
 * A phone number in its own row, so nothing has to guess a number inside
 * prose. `tbd` is the placeholder's token: a row that ships with no number
 * shows the placeholder until the band types one.
 */
const phoneRow = z.object({
  type: z.literal("phone"),
  label: translated,
  number: z.string().refine(isPhoneNumber),
  tbd: z.string().optional(),
});

const emailRow = z.object({ type: z.literal("email"), label: translated, address: z.string() });

/** A street address, shown under its label (the place's name) as a map link. */
const addressRow = z.object({
  type: z.literal("address"),
  label: translated.optional(),
  address: z.string(),
});

const linkRow = z.object({ type: z.literal("link"), label: translated, url: httpsUrl });

export const row = z.discriminatedUnion("type", [
  textRow,
  labelValueRow,
  phoneRow,
  emailRow,
  addressRow,
  linkRow,
]);

export type Row = z.infer<typeof row>;

/**
 * One card of a grid. `id` is stable, so a stored card and the default it
 * replaced can be told apart from a card the band added.
 */
export const card = z.object({
  id: z.string(),
  icon: z.enum(ICONS),
  tint: z.enum(TINTS),
  title: translated,
  rows: z.array(row),
});

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

export const cardsBlock = z.object({ cards: z.array(card) });

/** A fixed set of named texts, declared by the component that shows them. */
export function fieldsBlock<const N extends string>(names: readonly N[]) {
  const shape = Object.fromEntries(names.map((name) => [name, translated]));
  return z.object(shape as Record<N, typeof translated>);
}

export const NETWORKS = ["instagram", "facebook", "flickr"] as const;

export type Network = (typeof NETWORKS)[number];

/**
 * What the header and the footer of every page show. The band's name and
 * legal name are typed once and never translated.
 */
export const siteBlock = z.object({
  name: z.string(),
  pitch: translated,
  legalName: z.string(),
  networks: z.array(z.object({ network: z.enum(NETWORKS), url: httpsUrl })),
});
