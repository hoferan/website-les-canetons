---
status: accepted
date: 2026-11-02
decision-makers: André Hofer
---

# Store the band's wording of a public text over the catalogue default, edited in place

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

How does the Direction change any text a visitor reads, without a schema change or a
deploy for each new text?

## Considered Options

- Store the band's wording keyed by the text's catalogue key, over the catalogue default
- A text slot component at each place that needs one, keyed by a name the page chooses
- A settings screen listing the band's details

## Decision Outcome

Chosen option: "Store the band's wording keyed by the text's catalogue key", because every
public text already has a key in `fr.ts`/`de.ts`, so any of them becomes editable with no
new code on the server and no new key to invent.

- `text_overrides` holds one row per changed text: its catalogue key, a French and a German
  value. `GET /api/v1/texts` lists them for everyone. `PUT /api/v1/texts/{key}` sets one and
  needs `content.manage`. Blank in both languages deletes the row. Like a photo slot's write,
  it carries no `If-Match`: it sets one text, and the last save is what the page shows.
- The SPA reads them before the first render and writes them into i18next's resources, so
  `t()` returns the band's wording at every call site, document title included. A German
  page with only a French value shows the French one. A failed read renders the catalogue
  wording.
- `<EditableText k="…">` renders a text and, in edit mode, a pencil that opens a French and
  German dialog, or one field for a text that is the same in both languages (a name, a
  number, a link). Saving the original wording unchanged stores nothing. "Rétablir le texte
  d'origine" deletes the row.
- One edit-mode switch ("Modifier la page") on the public pages shows every pencil, the
  photo slots' included. Off, an editor sees the page as a visitor does.
- `content.manage` is a permission of its own, granted by migration to every role that held
  `images.manage`.

### Consequences

- Good, because a new editable text is a component and a catalogue key, with nothing to add
  on the server.
- Good, because the catalogue keeps the default, so an empty database shows the site as
  shipped and "Rétablir" always has something to go back to.
- Bad, because a stored row is keyed by a catalogue path, so renaming a key in the code
  orphans the band's wording for it. The SPA ignores a key the catalogue does not have.
- Bad, because a text with parameters (`{{n}}`) cannot be offered for editing, and the
  destination cards on the home page stay code: a pencil inside a link is not a usable
  control.
- Bad, because the static shell (`index.html`, the PWA manifests) and the logo still name
  the Canetons, so another band would change those in code.

### Confirmation

`TextOverrideTest` pins the API. `overrides.test.ts` pins the fallback rules and that the
catalogue default survives an override (i18next writes added resources into the object it
was initialised with). `EditMode.test.tsx` pins that photo controls follow the switch.
`web/e2e/edit-texts.spec.ts` stores the booking number from `/committee`.

## Pros and Cons of the Options

### A text slot component at each place that needs one

- Good, because the keys would name places, not catalogue paths.
- Bad, because every new editable text is a code change, and most of the page would stay
  code.

### A settings screen listing the band's details

- Bad, because it is the placements screen André rejected for photos: the Direction would
  edit a text away from the page that shows it.

## More Information

- [ADR-0028](0028-photos-live-in-the-database-in-sizes-made-by-the-browser.md): the photo
  slots this follows, a free key per place and a row made by the first write.
- [ADR-0026](0026-user-typed-content-carries-its-own-translations.md): user-typed content
  carries its own translations; a stored text is the band's own words in each language.
- #336 carries this setup from QA to PROD, the texts included.
