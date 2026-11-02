---
status: accepted
date: 2026-11-02
decision-makers: André Hofer
---

# Move the public website between servers as one file, imported all at once

## Context and Problem Statement

QA is to be cut over first. The Team Direction then sets up and approves the public
website there: texts ([ADR-0038](0038-public-texts-are-catalogue-defaults-the-band-overrides.md)),
photos and where they are shown ([ADR-0028](0028-photos-live-in-the-database-in-sizes-made-by-the-browser.md)),
and the history. PROD should then go live with the same website.

The host has FTP and no shell, so no database can be copied by hand. Shared hosting
limits the size of a request (#229 is measuring `post_max_size` and
`max_allowed_packet`), and the photo library may hold up to 150 MB.

How does the approved website on one server get onto another?

## Considered Options

- An export to one file and an import of it, both run from a page in the app
- The same, with members, roles and registers carried too
- A server-side zip uploaded in one request
- Set the website up again by hand on PROD

## Decision Outcome

Chosen option: "An export to one file and an import of it, both run from a page in the
app". It needs no shell, it can be run again, and it moves only what the Direction
approves.

- What travels is the website only: the stored texts, the whole photo library, the
  photo slots (event posters aside), and the history. Members, events, bookings, roles,
  registers, committee seats and event tags stay on the server they were entered on.
  The roster is entered on PROD, where the members log in.
- `/website` (`content.manage`) has two actions. `GET /api/v1/website/export` and
  `POST /api/v1/website/import` need `content.manage`, `images.manage` and
  `history.manage` together, since an import replaces what each of them guards.
- The browser does the heavy work. Export reads the JSON document and then fetches each
  stored size of each photo, writing one `.zip` (`site.json` and `images/<sha256>.jpg`,
  stored uncompressed, `fflate`). Import reads the zip and checks the target library has
  room. It uploads each missing photo through the same `POST /images` as `/media`, which
  finds a photo it already holds by its SHA-256 and keeps its name, waiting out a 429.
  Only then does it send the rest.
- The server applies the import in one transaction. Every text, every photo slot except
  the event posters, and every history entry are replaced; a photo the library lacks
  refuses the whole import. A register's photo goes to the register with the same
  French name; one without a match is skipped and reported. Library photos are never
  deleted.
- No `If-Match`: replacing everything is the point. The page asks the admin to type
  `REMPLACER` instead.

### Consequences

- Good, because no request carries more than one photo, whatever the library holds.
- Good, because an import is all or nothing, and a second run of the same file gives
  the same site.
- Bad, because photos uploaded before a refused import stay in the target library. They
  cost space but nothing else, and the next run reuses them.
- Bad, because a register photo needs the register to exist under the same French name
  on the target.

### Confirmation

`WebsiteExportTest` and `WebsiteImportTest` pin the document, the transaction, the
register remapping and the three permissions. `bundle.test.ts` and
`importRunner.test.ts` pin the file format, the room check and the 429 wait.
`web/e2e/website.spec.ts` exports, empties and imports against the mocked backend. The
PR for #336 carries a round trip between two local databases.

## Pros and Cons of the Options

### The same, with members, roles and registers carried too

- Good, because the roster would be typed once.
- Bad, because replacing members on a server that has events and answers needs merge
  rules. Passwords would either travel, a file full of hashes, or every member would
  need a new one anyway.

### A server-side zip uploaded in one request

- Bad, because the request size is capped by the host, and PHP's `ZipArchive` may not be
  installed there.

## More Information

Runbook: `staging/README.md`, "Moving the website from QA to PROD". Issue #336.
