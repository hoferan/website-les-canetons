---
status: accepted
date: 2026-11-03
decision-makers: André Hofer
---

# Edit the public pages block by block, over defaults the code ships

## Context and Problem Statement

The public pages had three placeholders that only a deploy could fill (#106): the booking
number on `/committee` and the two joining contacts on `/join`. Facts that change every
few years were written into the code as well: the instruments wanted, the rehearsal times,
the ages, the rehearsal place, the godparents' names, the band's name and its Instagram,
Facebook and Flickr addresses.

QA is to be set up and approved by the Team Direction before PROD goes live. PROD has no
shell, so whatever the Direction may need to change has to be changeable in the app.
André also asked that the site be built as if another Guggenmusik could run it under its
own name, without that being a goal yet.

A first version of #339 made every catalogue text editable on its own, with a pencil
beside each one. On a phone that was a page full of pencils that pushed the lines apart,
and it could not do what the band asks for in its own words: add a card to "the contacts
card", drop one, put the cards in another order, give one another icon or colour.

How does the Direction change what a visitor reads, in units the band thinks in, without
a schema change or a deploy for each new place?

## Considered Options

- One stored value per catalogue text, edited with a pencil beside it (what #339 first
  shipped)
- Typed content blocks: one stored JSON object per block, with types, renderers and
  editors in the SPA
- A hosted CMS
- Puck, a visual page builder for React

## Decision Outcome

Chosen option: "Typed content blocks", because the band talks about blocks, one control
per block keeps a phone page readable, and a list of cards stored as one object can gain,
lose and reorder cards with nothing new on the server.

- `content_blocks` holds one row per changed block: its key, chosen by the page as photo
  slots are (`join.facts`, `committee.contact`), and its `data` as JSON. The first save
  makes the row; "Rétablir l'original" followed by a save deletes it.
  `GET /api/v1/blocks` lists them for everyone. `PUT /api/v1/blocks/{key}` with `{data}`
  needs `content.manage`, and `data: null` deletes the row. Like a photo slot's write, it
  carries no `If-Match`: it sets one block, the last save is what the page shows, and the
  audit log has both.
- The server checks only the size and nesting of `data`, never what it means
  (`App\Support\BlockShape`): an object, at most six levels deep, lists of at most 24
  items, strings of at most 2000 characters, object keys of a letter then letters and
  digits (32 at most), and 64 KB once encoded. Empty strings are kept, since a phone row
  with no number yet is `""`, so the route is exempt from Laravel's empty-string-to-null
  conversion.
- The SPA owns the block types (`web/src/content/`). Each is a `zod` schema in `types.ts`
  and a renderer in `blocks/`, registered with its default and its editor title in
  `registry.ts`. The first set is `hero`, `cards` (cards with an icon, a colour, a title and
  typed rows), `fields` (named fields a component declares) and `site` (the band's name,
  its pitch, its legal name and its networks, read by the header and the footer).
- A block's default is the page as the code ships it, built from `fr.ts`/`de.ts`. An empty
  database shows the site as shipped, and "Rétablir l'original" always has a target. A
  stored block that its type does not accept, saved by another build or under a type that
  has changed since, shows the default instead and says so on the console. A save equal to
  the default is sent as null, so a later correction in the code reaches that page again.
- One rule for every text field: it is stored as `{fr, de?}`. The editor shows one field,
  and "+ Deutsch" opens a second when the German differs. A missing or blank `de` shows
  the French on the German page. Numbers, e-mail addresses, street addresses and URLs are
  plain strings and never translated.
- A card's rows are typed: text, label and value, phone, e-mail, address, link. A phone
  number has its own row type, so nothing guesses a number inside prose, and a row that
  ships with an empty number shows the `<Tbd>` placeholder until the band types one, so
  the count of what is missing before PROD (#106) still works by rendering the pages. The
  editor refuses a number that cannot be dialled (it needs a leading `+`, `00` or `0`)
  and a link that is not https. A read only checks the shape, so one odd value from an
  import does not hide the whole block, and a renderer checks a number or a URL again
  before it becomes a link: an odd one shows as plain text.
- One floating pill on the public pages, "Modifier la page", turns edit mode on, and
  "Terminer la modification" turns it off. In edit mode each block wears one raised
  "Modifier" chip on its top right corner. A hero or a card then makes 40px of room above
  its first line, so the chip covers no text and the lines break as a visitor sees them.
  A card grid also shows "Ajouter une carte", and each card its own chip. The photo slots follow the
  same switch. Off, an editor sees the page as a visitor does.
- An editor is one dialog, a bottom sheet on a phone, titled by the block's place
  ("Comité · contact"), built with `react-hook-form` from the parts in
  `web/src/content/editor/`. `BlockEditor` and `useSaveBlock` read and save through the
  block registry. The field parts only need a form around them: the translated field,
  the plain field, the list with add, move and remove, the row fields, and the icon and
  colour pickers. The booking form's editor (ADR 0032) is meant to move onto those.
- `content.manage` is a permission of its own, granted by migration to every role that
  held `images.manage`.

### Consequences

- Good, because a new editable place is a block in the registry and a component on the
  page, with nothing to add on the server.
- Good, because the band can add, remove and reorder cards and change their icon and
  colour, which no per-text store could express.
- Good, because the catalogue keeps every default, so an empty database shows the site as
  shipped.
- Bad, because a stored block is keyed by a name in the code, so renaming a block key
  orphans the band's version of it, and changing a type's shape sends stored blocks of
  the old shape back to the default. Such a change needs a migration of the stored rows.
- Bad, because the server cannot check what a block means, so a hand-made request can
  store a block that the SPA then refuses and replaces with the default.
- Bad, because the band picks icons and colours from fixed sets and cannot invent a new
  block type; the home page's destination cards, the logo, the theme colours and the set
  of pages stay code.
- Bad, because the static shell (`index.html`, the PWA manifests) and the logo still name
  the Canetons, so another band would change those in code.

### Confirmation

`ContentBlockTest` pins the API and the shape limits. `registry.test.ts` checks that
every default fits its type, and `BlocksProvider.test.tsx` that a stored block of the
wrong shape shows the default. `EditMode.test.tsx` pins the pill and that photo controls
follow it. `web/e2e/edit-blocks.spec.ts` stores the booking number from the contact card
on `/committee` and checks the phone link.

## Pros and Cons of the Options

### One stored value per catalogue text

- Good, because every text already had a key, so any of them became editable with no new
  key to invent.
- Bad, because a pencil per text is noise on a phone and moves the lines it sits between.
- Bad, because a text cannot add, remove or reorder a card, nor change its icon or
  colour.
- Bad, because a stored value is keyed by a catalogue path, so renaming a key in the code
  orphans it silently.

### A hosted CMS

- Good, because editing screens, history and roles come ready made.
- Bad, because the band's content would live with a third party, behind another account
  and possibly a subscription, outside the site's own export.
- Bad, because the Direction would edit away from the page that shows the text, the
  placements screen André rejected for photos.

### Puck

- Good, because it is an in-place visual editor for React with drag and drop.
- Bad, because it builds pages from components the user arranges, which is far more than
  the band needs: the page set and the layout stay code.
- Bad, because its stored format is its own, and the site would depend on it to read its
  pages.

## More Information

- [ADR-0028](0028-photos-live-in-the-database-in-sizes-made-by-the-browser.md): the photo
  slots this follows, a free key per place and a row made by the first write.
- [ADR-0026](0026-user-typed-content-carries-its-own-translations.md): user-typed content
  carries its own translations; a stored block holds the band's own words in each
  language.
- [ADR-0032](0032-compose-a-booking-form-from-blocks.md): the booking form's blocks, whose
  editor can reuse the parts above.
- #336 carries this setup from QA to PROD, the blocks included.
