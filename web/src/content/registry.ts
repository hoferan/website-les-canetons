import type { z } from "zod";

import type { TranslationKey } from "../i18n";
import { catalogueString, catalogueValue } from "../i18n/catalogueText";
import { fromCatalogue, type Translated } from "./translated";
import { cardsBlock, forEditor, heroBlock, siteBlock } from "./types";

/**
 * Every content block a page shows, by the key it is stored under.
 *
 * A block's default is the page as the code ships it, built from the
 * catalogue: an empty database shows the site as shipped, and "Rétablir" has
 * something to go back to. A function rather than a value, so each caller
 * gets its own copy to edit.
 *
 * `label` names the block's place on the site, for the editor's title.
 *
 * `editSchema` is what the editor saves against, where it checks more than a
 * read does (see types.ts); without one the editor uses `schema`.
 */
type BlockDefinition<S extends z.ZodType> = {
  schema: S;
  editSchema?: z.ZodType<z.output<S>, z.input<S>>;
  defaults: () => z.output<S>;
  label: TranslationKey;
};

/** Ties a default to its schema, so a default of the wrong shape fails the build. */
function block<S extends z.ZodType>(definition: BlockDefinition<S>): BlockDefinition<S> {
  return definition;
}

/**
 * A hero from its catalogue keys. `mark` and `intro` are left out where the
 * page has no highlight or no paragraph under its heading.
 *
 * A title with a German wording gets its German highlight stored even when it
 * reads the same as the French one ("Canetons"): the German page then reads
 * the German mark alone (see `trMark`).
 */
function hero(
  keys: {
    title: TranslationKey;
    mark?: TranslationKey;
    intro?: TranslationKey;
    /** The buttons under the heading: a public page and the catalogue key of its label. */
    actions?: Array<{ to: string; label: TranslationKey }>;
  },
  label: TranslationKey,
) {
  return block({
    schema: heroBlock,
    editSchema: forEditor.heroBlock,
    defaults: () => ({
      title: fromCatalogue(keys.title),
      ...(keys.mark ? { mark: markOf(keys.title, keys.mark) } : {}),
      ...(keys.intro ? { intro: fromCatalogue(keys.intro) } : {}),
      ...(keys.actions
        ? {
            actions: keys.actions.map((action) => ({
              label: fromCatalogue(action.label),
              to: action.to,
            })),
          }
        : {}),
    }),
    label,
  });
}

function markOf(title: TranslationKey, mark: TranslationKey): Translated {
  const shipped = fromCatalogue(mark);
  if (fromCatalogue(title).de === undefined) return shipped;
  return { fr: shipped.fr, de: catalogueValue("de-CH", mark) ?? shipped.fr };
}

export const BLOCKS = {
  site: block({
    schema: siteBlock,
    editSchema: forEditor.siteBlock,
    defaults: () => ({
      name: catalogueString("site.name"),
      pitch: fromCatalogue("nav.footerPitch"),
      legalName: catalogueString("site.legalName"),
      networks: [
        {
          label: "Instagram",
          url: catalogueString("site.instagramUrl"),
          icon: "instagram" as const,
        },
        { label: "Facebook", url: catalogueString("site.facebookUrl"), icon: "facebook" as const },
        { label: "Flickr", url: catalogueString("site.flickrUrl"), icon: "flickr" as const },
      ],
      // What a parent who has read a page to its foot most wants to do next.
      actions: [
        { label: fromCatalogue("nav.join"), to: "/join" },
        { label: fromCatalogue("nav.contact"), to: "/contact" },
      ],
    }),
    label: "blocks.site",
  }),

  "home.hero": hero(
    {
      title: "home.hero",
      mark: "home.heroHighlight",
      intro: "home.heroSub",
      // The two things a visitor most often comes to do, as the nav names them.
      actions: [
        { to: "/join", label: "nav.join" },
        { to: "/agenda", label: "nav.agenda" },
      ],
    },
    "blocks.home.hero",
  ),

  "join.hero": hero(
    { title: "join.heading", mark: "join.headingHighlight", intro: "join.intro" },
    "blocks.join.hero",
  ),

  "join.facts": block({
    schema: cardsBlock,
    editSchema: forEditor.cardsBlock,
    defaults: () => ({
      cards: [
        {
          id: "instruments",
          icon: "music" as const,
          tint: "pink" as const,
          title: fromCatalogue("join.facts.instruments.heading"),
          // One row, an instrument per line, as the page shows it today.
          rows: [{ type: "text" as const, text: fromCatalogue("join.facts.instruments.list") }],
        },
        {
          id: "schedule",
          icon: "clock" as const,
          tint: "cyan" as const,
          title: fromCatalogue("join.facts.schedule.heading"),
          rows: [
            { type: "text" as const, text: fromCatalogue("join.facts.schedule.day") },
            { type: "text" as const, text: fromCatalogue("join.facts.schedule.time") },
          ],
        },
        {
          id: "age",
          icon: "cake" as const,
          tint: "lime" as const,
          title: fromCatalogue("join.facts.age.heading"),
          rows: [{ type: "text" as const, text: fromCatalogue("join.facts.age.range") }],
        },
        {
          id: "place",
          icon: "map-pin" as const,
          tint: "yellow" as const,
          title: fromCatalogue("join.location"),
          rows: [
            // The place's name is the map link's text; the link searches for
            // the name and the address together.
            {
              type: "address" as const,
              label: fromCatalogue("join.locationPlace"),
              address: catalogueString("join.locationAddress"),
            },
            { type: "text" as const, text: fromCatalogue("join.locationArea") },
          ],
        },
        {
          id: "contacts",
          icon: "phone" as const,
          tint: "lilac" as const,
          title: fromCatalogue("join.contacts"),
          // One per person the old page listed, each a placeholder until the
          // band types a name and a number. No guessed number: a wrong one
          // dials a stranger.
          rows: [joiningContact(), joiningContact()],
        },
      ],
    }),
    label: "blocks.join.facts",
  }),

  "committee.hero": hero(
    { title: "committee.heading", mark: "committee.headingHighlight" },
    "blocks.committee.hero",
  ),

  // "Écrire au comité" stays in the page's code: it links to the contact
  // form, and the band has nothing to change there.
  "committee.contact": block({
    schema: cardsBlock,
    editSchema: forEditor.cardsBlock,
    defaults: () => ({
      cards: [
        {
          id: "contact",
          icon: "phone" as const,
          tint: "yellow" as const,
          title: fromCatalogue("committee.contactHeading"),
          rows: [
            {
              type: "phone" as const,
              label: fromCatalogue("committee.booking"),
              number: "",
              tbd: "booking-number",
            },
          ],
        },
      ],
    }),
    label: "blocks.committee.contact",
  }),

  "band.hero": hero({ title: "band.heading", mark: "band.headingHighlight" }, "blocks.band.hero"),

  "band.godparents": block({
    schema: cardsBlock,
    editSchema: forEditor.cardsBlock,
    // One card with a photo, as the page showed it when it was a fields block.
    // The photo lives in its own slot, `band.godparents.godparents`.
    defaults: () => ({
      cards: [
        {
          id: "godparents",
          icon: "heart" as const,
          tint: "pink" as const,
          title: fromCatalogue("band.patronsHeading"),
          rows: [{ type: "text" as const, text: fromCatalogue("band.patrons") }],
          photo: true,
        },
      ],
    }),
    label: "blocks.band.godparents",
  }),

  "history.hero": hero(
    { title: "history.heading", mark: "history.headingHighlight" },
    "blocks.history.hero",
  ),

  // The contact page's heading has no highlight.
  "contact.hero": hero({ title: "contact.heading", intro: "contact.intro" }, "blocks.contact.hero"),

  "agenda.hero": hero(
    { title: "agenda.heading", mark: "agenda.headingHighlight", intro: "agenda.intro" },
    "blocks.agenda.hero",
  ),
};

function joiningContact() {
  return { type: "phone" as const, label: { fr: "" }, number: "", tbd: "join-contact" };
}

export type BlockKey = keyof typeof BLOCKS;

export type BlockData<K extends BlockKey> = z.output<(typeof BLOCKS)[K]["schema"]>;
