---
status: accepted
date: 2026-10-03
decision-makers: André Hofer
---

# Keep photos in the database, in three sizes the browser makes

## Context and Problem Statement

Eight places on the site show a grey "photo to come" box: the band, the concert
and six registers. The history entries want a picture too. Every photograph so
far has been committed by a developer, which is why the page still has the
boxes. The committee should be able to put a photo on the site itself.

The host constrains the design in five ways.

- The database quota is 1000 MB, and the account allows 10 simultaneous
  connections and 50 000 requests an hour.
- The FTP account is chrooted to the web root, so the only writable place for
  files is inside the deploy tree. `--relist` and bootstrap deploys delete
  everything the build lacks, except the exact paths in `PROTECTED_PATHS`, so a
  folder of uploads would need its own protection in the deploy tool, and the
  PHP user would need write permission on it on every server.
- Nobody has recorded which PHP extensions the host loads. Decoding a 24 MP
  camera original takes about 100 MB, which is at the edge of a shared host's
  `memory_limit`, and it fails as a 500 rather than a refusal.
- `.htaccess` is server-owned and placed by hand on each server. Changing it
  means a hand edit on three hosts, and a bad edit takes the whole site down.
- A phone on a rehearsal-room connection should not download a 1920 px photo
  to show it 358 px wide.

How do photos get onto the site, where do they live, and how are they served?

## Considered Options

- Photo bytes in a database `MEDIUMBLOB`, in three sizes made by the browser,
  served by Laravel
- Files in the deploy tree under `_api/storage/app/images/`, one size, served
  by Laravel
- Server-side resizing with GD or Imagick
- A root `/media/` directory served by Apache, with an `.htaccess` change
- One upload per slot, with no shared library

## Decision Outcome

Chosen option: "Photo bytes in a database `MEDIUMBLOB`, in three sizes made by
the browser, served by Laravel", because it needs no host change, no PHP
extension, no `.htaccess` edit and no writable folder, and a photo is stored
or not stored in one transaction.

The branch first shipped the files option. It was dropped before any server
ran it, for four reasons. The quota is now known, and 150 MB of photos fits it
with room to spare. PHP serves the bytes in either case, since the files sat
behind Laravel too. The database needs no folder permission and no deploy
protection, so the deploy tool keeps the shape it has on `main`. And a row
with its sizes commits or rolls back together, where a file and its row could
disagree after a failure.

What this fixes:

- The browser makes the sizes; the server never decodes. `shrink()` decodes a
  photo once and draws it at 1920, 960 and 480 px on the longest edge, every
  size from that one decoded bitmap, releasing each canvas as soon as its JPEG
  exists. It never upscales: a source smaller than a target
  keeps its own size and gets the smaller targets, so 700 px gives 700 and 480
  and 400 px gives 400 alone. Each size is a JPEG, starting at quality 0.82 and
  stepping down by 0.07 to a floor of 0.6 until it is at most 600 KB. The
  re-encode drops the original's EXIF, and a byte walk then cuts every comment
  and every APPn segment the server would refuse, such as the Exif block
  WebKit's encoder may add.
- One upload carries one photo: `POST /api/v1/images` with one to three
  `files[]` parts and a `name`. The part name has the brackets because PHP keeps
  only the last of several parts sharing a bare name; the generated client sends `files`, so the
  SPA builds that request itself.
- The server inspects without decoding. It refuses more than three parts, or a
  request heavier than three full sizes, before reading any part. Each part
  must be a JPEG by `getimagesize()`, at least one pixel and at most 1920 px on
  each edge, and at most 600 KB. Its segments must be the ones a canvas encoder
  writes: SOI, APP0 (JFIF), APP2 (an ICC profile), APP14 (Adobe), DQT, DHT,
  DRI, SOF0 to SOF2, SOS with its scan, and EOI. A comment or any other APPn
  is refused as metadata (`image_has_metadata`), and a byte where a marker
  should be, or any other marker, as `image_unexpected_data`. The file must
  end exactly at its EOI marker. Bytes after EOI are ignored by every decoder,
  which is where a JPEG/HTML or JPEG/ZIP polyglot keeps its second file.
  None of this reaches into the scan: entropy-coded data can carry arbitrary
  bytes, HTML included, at the price of a garbled picture, and no check short
  of decoding can refuse them. The headers the file route sends are the
  defence for that. The set must have distinct widths, and every part must have
  the shape of the largest, within one pixel of rounding. The largest part is the
  photo: its SHA-256 identifies it, and its width and height are the photo's.
  No image extension and none of Laravel's `image`, `mimes` or `dimensions`
  rules is involved, because those need `fileinfo`. The limits are in
  `api.images.*`, the same numbers `tools/image-budget.mjs` holds for
  photographs in the repository.
- `images` holds one row per photo; `image_files` holds one row per size,
  keyed by `(image_id, width)`, with the bytes in a `MEDIUMBLOB`, the SHA-256
  of those bytes in an indexed `sha256` column, and deleted with the photo.
  The server computes each digest from the bytes it stores and never takes one
  from the request. Laravel's `binary()` would make a 64 KB `BLOB`, so the
  migration adds the column by hand and a test reads its type back. Only the
  file route ever selects `data`. The `sizes` relation names its columns, and a
  test listens to every query of the library and the public pages and fails if
  one of them selects the bytes.
- A size is served at `GET /api/v1/images/{sha256}.jpg`, where `{sha256}` is
  the digest of that size's own bytes. The path names exactly the bytes it
  answers, so it answers `Cache-Control: public, max-age=31536000, immutable`
  and an `ETag` that is the same digest. Two rows can only share a digest by
  holding the same bytes, so whichever one the lookup finds answers alike. It
  also sends `X-Content-Type-Options: nosniff` and
  `Content-Security-Policy: default-src 'none'; sandbox`, so a crafted file
  opened on its own runs nothing. The route is public and stateless: no session
  cookie, no `no-store`.
- A photo costs one query, and a revalidation none. A matching
  `If-None-Match` answers `304` before the database is touched, which is safe
  because the tag is the digest of the bytes: whoever holds it already has
  exactly those bytes. The route also runs without `RunPendingMigrations`, which would add
  two queries to each photo of a page. The SPA's first call,
  `GET /api/v1/config`, still migrates a fresh deploy before any page asks for
  a photo. Laravel opens a connection only when a query runs, so a 304 holds
  none of the ten, and a 200 closes its connection as soon as the row is read,
  before the bytes go out to a client that may be slow.
- The file route has no rate limit, on purpose. Laravel's throttle counts in
  the `database` cache store, so it would add queries to every photo, against
  the same ten connections. What bounds the cost instead is the year of
  `immutable` caching, the 304 without a query and the one indexed read per
  size.
- Every resource that shows a photo carries `url` (the largest size), `width`,
  `height` and `srcset`. `<Photo>` renders all of them with a `sizes` measured
  for its layout, so the browser loads the smallest size that fills the box at
  the screen's pixel density. On `/band` at 390 px and a density of 1 that is
  the 480 px size; on a desktop, the 960 px one.
- The library holds at most 100 photos and 150 MB, every size counted, both
  refused with `image_library_full`. Those two limits are in
  `api/config/api.php` and must never reach `api/.env.example`. An account can
  also upload 60 times a minute, a throttle set in `AppServiceProvider`.
  A database that refuses the write for want of room (a full table or disk, a
  packet over `max_allowed_packet`, or INSERT revoked by a quota tool) answers
  `507 image_storage_full` rather than a 500, because retrying will not help
  until somebody frees space.
- Uploads are serialised by an advisory lock,
  `GET_LOCK('lescanetons_image_upload')`, held while the digest is checked, the
  caps read and the row and its sizes inserted. The caps are a read followed by
  an insert, and two uploads that both read 99 would both pass. A row lock was
  tried first and rejected: `SELECT COUNT(*) ... FOR UPDATE` on an empty
  `images` table takes gap locks, and two concurrent uploads deadlocked on
  MariaDB 10.3. The lock is a raw advisory lock for the reason
  `RunPendingMigrations` uses one. An upload that cannot get it within ten
  seconds answers `503 service_unavailable`, which the queue shows as a failed
  card with a Retry button.
- The browser queues. One shrink at a time and at most two uploads in flight,
  with a retry for each failed photo, so a selection of sixty photos from a
  phone does not hold sixty decoded bitmaps.
- Alt text belongs to the placement, and only a history entry has any. An
  upload carries no text. A history entry's photo illustrates something the
  committee wrote, so the entry form takes an alt text in each language, which
  a field on the library photo could not offer (ADR 0026). The band, concert
  and register slots take none: the page describes the photo by the band's name
  or the register's, and sixteen more fields would not be kept up to date.
  Members have no photo at all.
- A photo has a name, at most 120 characters: the committee's label for it in
  the library and the picker, one name rather than one per language. The upload
  fills it from the file name without its extension, and
  `PATCH /api/v1/images/{image}` changes it under `If-Match`. It refuses
  control characters and the bidirectional overrides that make a downloaded
  file name read backwards. It is never alt text and no public page shows it.
- A photo can be replaced: `POST /api/v1/images/{image}/file` takes new sizes
  under `If-Match`. It is a POST because PHP parses multipart bodies on POST
  alone. The request runs the upload's checks through the same code
  (`ReceivesImageSizes`), and the controller stores under the same lock and
  transaction with the same `507` mapping. The row and its sizes change
  together; the byte cap counts only what the swap adds, and the photo cap
  does not apply, since the count stays the same. A photo another image
  already holds is refused with `image_already_in_library`, and the photo the
  image already holds changes nothing. Placements name the id, so every page
  that shows the photo shows the new one.
- Every write on a photo (rename, replace, delete) checks its `If-Match` a
  second time once it holds the photo's row `FOR UPDATE`. The middleware checks
  it before any lock is held, and a write that landed in between would
  otherwise be undone, or deleted, by somebody who never saw it. Such a write
  answers 412 instead.
- Replacing is safe with a year of `immutable` caching because every size's
  path is the digest of its own bytes. New bytes always get a new path, and a
  path never comes to mean other bytes: not after a replacement, not after a
  delete and a fresh upload of the same photo whose smaller sizes were encoded
  differently, and not after a replacement back to an earlier photo.
- Turning a photo a quarter is a replacement made in the browser. The page loads
  the largest stored size, draws it turned on a canvas and sends it through
  `encodeSizes()`, the pipeline `shrink()` uses for an upload, so every stored
  size comes from the same targets, quality steps and metadata scrub. Nothing
  keeps the original, so each turn re-encodes the photo once more.
- A photo is placed where the page shows it. The library screen, `/media`,
  uploads, lists, searches, sorts, filters and deletes, and each photo has a
  page of its own, `/media/:id`, to rename, turn, replace, download or delete
  it. That page, and the photo's card in the library, link to each place that
  shows it. On `/band` and on the home page, somebody holding `images.manage`
  finds an add button inside an empty slot and a pencil over a placed photo,
  and can drop a file on either. The control reads
  `GET /api/v1/photo-placements`, changes its own slot and writes the whole
  document back with that read's `ETag`, so a placement somebody made in the
  meantime answers 412 instead of being undone. Visitors see nothing extra.
- One shared library, and a photo can be placed in several places. Deleting a
  photo that something still shows is refused with `image_in_use`; the foreign
  key from every placement to `images` restricts on delete as the backstop.

### Consequences

- Good, because nothing outside this repository changes: no extension, no
  `.htaccess` edit, no new server setting, no writable folder, and the deploy
  tool is unchanged.
- Good, because a photo and its sizes are written in one transaction and
  deleted in one statement, and a backup of the database is a backup of the
  photos.
- Good, because a phone does the heavy work, and the shared host never decodes
  an image.
- Good, because a phone loads the size it draws, and a browser keeps each size
  for a year.
- Bad, because the database dump grows by the library, up to 150 MB at the
  cap, and a dump or restore takes correspondingly longer.
- Bad, because every photo a browser has not cached is a PHP request, and one
  of the host's ten connections for as long as the read of up to 600 KB takes.
  `/band` shows seven photos at most and the history one per entry,
  `loading="lazy"` fetches each only as it nears the screen, and a year of
  `immutable` caching means a returning visitor sends none. Apache would serve
  a static file without a connection at all.
- Bad, because nothing limits how often anybody may fetch a photo. A loop
  without `If-None-Match` costs a PHP worker and a short read per request.
- Bad, because the server trusts the browser's shrink to a degree. It checks
  size, dimensions, type, every segment, trailing bytes and the shape of the
  set, but cannot tell a real photograph from any other valid JPEG, see into
  its scan data, or check that a smaller size shows the same picture as the
  largest.
- Bad, because the caps are rough numbers chosen against the quota, not a
  measurement of what the band will upload.

### Confirmation

`JpegInspectorTest` has a test per refusal, polyglots, comments and every
refused segment included.
`ImageLibraryTest` pins the set checks, both caps, the duplicate answer, the
lock, the rollback, the `507` mapping and that no read but the file route
selects the bytes, and that two sizes of one photo, or the same largest size
sent again with other smaller sizes, never share a URL. `ImageFileTest` pins
the headers, that a path serves only the bytes it names, the one query, the
connection closed before the response leaves, and the `304` with no query at
all, for the size's own digest and no other. `ImageSchemaTest` reads the
`MEDIUMBLOB` type back, round-trips 600 KB through it, and fails if a page slot
gains alt columns or a member gains a photo. `shrink.test.ts` pins the sizes a source gets and the
segments the browser strips before the server could refuse them, and
`web/e2e/media.spec.ts` uploads a photo through a real canvas on `/media`,
checks its three sizes and places it from `/band`, then renames it, turns it
(the largest size's sides swap) and replaces it on its own page, and checks
that `/band` shows the new photo. `ImageLibraryTest` runs every upload refusal
against the replacement too, and pins the duplicate answer, the byte cap on the
difference, the sizes swapped in one transaction and the second tag check.

## Pros and Cons of the Options

### Files in the deploy tree, one size

- Good, because Apache's PHP would read a file rather than a row, with no
  database connection for the bytes.
- Bad, because the deploy tool needs a protected prefix, or the next
  `--relist` deploy deletes every photo, and each server needs a folder the PHP
  user may write.
- Bad, because a file and its row can disagree after a failure, which needs
  cleanup code of its own.
- Bad, because the photos are not in a database dump, so they need their own
  backup.

### Server-side resizing with GD or Imagick

- Good, because the server could accept any photo at any size and make the
  sizes itself.
- Bad, because the extensions are unconfirmed on this host.
- Bad, because decoding a camera original needs about 100 MB, at the edge of
  `memory_limit`. The failure is a 500 on the committee's first big upload.

### A root `/media/` directory served by Apache

- Good, because Apache would serve static files without PHP.
- Bad, because every catch-all and dispatch rule in `.htaccess` would need an
  exception, and that file is placed by hand on each server. A mistake there
  takes the site down, which `CLAUDE.md` warns about at length.
- Bad, because the directory would sit in the deploy tree too and need the same
  protection.

### One upload per slot

- Good, because there is no library to manage and no cap.
- Bad, because the same photo cannot be in two places without uploading it
  twice.

## More Information

Issue #105. ADR 0026 explains why alt text, which is user-typed, carries both
languages. ADR 0008 explains `RunPendingMigrations`, which the file route
skips.
