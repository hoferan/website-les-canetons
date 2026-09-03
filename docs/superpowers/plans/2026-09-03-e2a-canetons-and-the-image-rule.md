# E2a — `/canetons`, and the image rule — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/canetons` navigable as the long, photographed page it is designed to become, shrink what an absent photograph costs, and add the guard that stops an unprocessed camera original ever entering the repository.

**Architecture:** Three independent changes, in this order. (1) `tools/image-budget.mjs` — a `node:test`-covered guard, modelled on `tools/secret-guard.mjs`, that walks `web/public/assets/img/` and fails on any image over the documented budget, reading dimensions from the file header rather than adding an image library. (2) `PhotoPending` drops from a 160px-minimum box to one line, unchanged in props and behaviour. (3) A new `RegisterIndex` component renders jump links above the register list, and each register `<article>` on `/canetons` gains a stable `id` the links anchor to.

**Tech Stack:** React 19 + TypeScript, Tailwind 4 (CSS-first, tokens in `web/src/styles.css`), Vitest + Testing Library for `web/src`, `node:test` for `tools/`.

**Spec:** `docs/superpowers/specs/2026-09-01-e2a-canetons-and-the-image-rule-design.md` — read it before Task 1. Every "why" below is short because it is written out there.

**Branch:** the E2 specs sit in an unpushed commit `dce966a` on `docs/e2-specs`. Work on `feat/e2a-canetons-and-image-rule`, branched from that commit, so the three specs and this round ship in one PR:

```bash
git checkout -b feat/e2a-canetons-and-image-rule docs/e2-specs
```

**Do not merge the PR.** Opening it is the deliverable — a merge to `main` auto-deploys TEST.

---

## File Structure

| File | Status | Responsibility |
| --- | --- | --- |
| `tools/image-budget.mjs` | create | Header-only dimension read, the budget audit, and the CLI. One file because `secret-guard.mjs` is one file and this is the same kind of thing. |
| `tools/image-budget.test.mjs` | create | `node:test` coverage: the header parse, the budget rules, the exemption list, the CLI's exit codes. |
| `package.json` | modify | `guard:images` script, appended to `check` beside `guard`. |
| `web/src/components/PhotoPending.tsx` | modify | Same props, same `data-photo-pending` hook, one line instead of a box. |
| `web/src/components/PhotoPending.test.tsx` | create | Pins the contract the slimming must not break. |
| `web/src/components/RegisterIndex.tsx` | create | The jump-link row. Takes its entries as a prop — it knows nothing about registers. |
| `web/src/components/RegisterIndex.test.tsx` | create | One link per entry, in order, each `href` a fragment. |
| `web/src/pages/Canetons.tsx` | modify | `REGISTERS` gains `id` and `short`; the index renders above the list; each `<article>` gains its `id`. |
| `web/src/pages/Canetons.test.tsx` | modify | Adds the anchor-integrity test — every index link points at a section that exists. |
| `CLAUDE.md` | modify | The budget is no longer only prose. |
| The E2a spec | modify | `Status:` line. |

---

## Task 1: The image header reader

`tools/image-budget.mjs` must know a file's pixel dimensions without an image
library — this project has no runtime dependencies by design and should not gain
a build-time one for a size check. PNG puts them at fixed offsets; JPEG requires
walking the marker segments to the frame header.

**Files:**
- Create: `tools/image-budget.mjs`
- Create: `tools/image-budget.test.mjs`

- [ ] **Step 1: Write the failing test**

Create `tools/image-budget.test.mjs`:

```js
import assert from 'node:assert/strict';
import test from 'node:test';

import { readDimensions } from './image-budget.mjs';

// Fixture builders. These are HEADERS, not decodable images -- the guard reads
// headers, so a header is all a fixture needs, and building one by hand is what
// lets these tests run with no image library and no binary files in git.

/**
 * SOI, one SOF0 frame header carrying the dimensions, then EOI.
 * `bytes` pads the file out afterwards, for the file-size tests in Task 2.
 */
export function jpeg(width, height, bytes = 0) {
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0); // SOF0 marker
  sof.writeUInt16BE(17, 2); // segment length, including these two bytes
  sof.writeUInt8(8, 4); // sample precision
  sof.writeUInt16BE(height, 5); // HEIGHT precedes WIDTH in a JPEG frame header
  sof.writeUInt16BE(width, 7);
  sof.writeUInt8(3, 9); // component count; its 9 bytes of data may stay zero
  const file = Buffer.concat([Buffer.from([0xff, 0xd8]), sof, Buffer.from([0xff, 0xd9])]);
  return bytes > file.length ? Buffer.concat([file, Buffer.alloc(bytes - file.length)]) : file;
}

/** The 8-byte signature and an IHDR chunk, which is where PNG keeps its size. */
export function png(width, height, bytes = 0) {
  const file = Buffer.alloc(Math.max(24, bytes));
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(file, 0);
  file.writeUInt32BE(13, 8); // IHDR payload length
  file.write('IHDR', 12, 'ascii');
  file.writeUInt32BE(width, 16);
  file.writeUInt32BE(height, 20);
  return file;
}

test('reads the dimensions out of a PNG header', () => {
  assert.deepEqual(readDimensions(png(536, 489)), { width: 536, height: 489 });
});

test('reads the dimensions out of a JPEG frame header', () => {
  assert.deepEqual(readDimensions(jpeg(1920, 1275)), { width: 1920, height: 1275 });
});

test('reads a portrait JPEG the right way up', () => {
  // lyre.jpg is 1277x1920 -- the one portrait image among the legacy eight. A
  // reader that swapped the pair would call it landscape and pass it silently.
  assert.deepEqual(readDimensions(jpeg(1277, 1920)), { width: 1277, height: 1920 });
});

test('walks past marker segments that precede the frame header', () => {
  // A real JPEG opens with APP0/APP1 (JFIF, EXIF) before any frame header. A
  // reader that assumed the frame came first would measure their payload.
  const app0 = Buffer.alloc(18);
  app0.writeUInt16BE(0xffe0, 0);
  app0.writeUInt16BE(16, 2);
  app0.write('JFIF\0', 4, 'ascii');
  const withApp0 = Buffer.concat([jpeg(4000, 3000).subarray(0, 2), app0, jpeg(4000, 3000).subarray(2)]);

  assert.deepEqual(readDimensions(withApp0), { width: 4000, height: 3000 });
});

test('returns null for a format it cannot measure', () => {
  // A .webp or an .svg is not an error -- the file-size budget still applies to
  // it, and Task 2 relies on null meaning "size-check only".
  assert.equal(readDimensions(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" />')), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/image-budget.test.mjs`

Expected: FAIL — `Cannot find module .../tools/image-budget.mjs`.

- [ ] **Step 3: Write the minimal implementation**

Create `tools/image-budget.mjs`:

```js
// Fails if any image in web/public/assets/img/ breaks the documented budget.
//
// WHY THIS EXISTS. CLAUDE.md documents the budget -- longest edge 1920px, JPEG
// quality 82, progressive, no EXIF, roughly 300-600 KB -- and says in as many
// words that nothing in the test suite or the linters can catch an unprocessed
// original being dropped in. That was true, and it cost 44.5 MB once already:
// the legacy /canetons still serves eight photographs totalling 37.5 MB,
// including a 19.8 MB 6048x4024 camera original. The band is about to re-shoot
// those eight and hand them over. This is what stops them arriving raw.
//
// It reads dimensions out of the file HEADER rather than adding an image
// library: this project has no runtime dependencies by design and should not
// gain a build-time one for a size check.

/**
 * The pixel size of a PNG or JPEG, or null for anything else.
 *
 * null is not a failure -- a format this cannot measure still gets its file
 * size checked, which is the half of the budget that catches a camera original.
 */
export function readDimensions(buffer) {
  // PNG: an 8-byte signature, then IHDR, whose payload opens with the size.
  if (buffer.length >= 24 && buffer.readUInt32BE(0) === 0x89504e47) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  // JPEG: walk the marker segments to the frame header. A real file opens with
  // APP0/APP1 (JFIF, EXIF) and may carry several more segments first, so the
  // frame header cannot be assumed to be at any fixed offset.
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = buffer[offset + 1];
      // 0xFF is a fill byte; 0xD0-0xD9 (RSTn, SOI, EOI) and 0x01 carry no
      // length word, so stepping over them by a segment length would desync.
      if (marker === 0xff) {
        offset += 1;
        continue;
      }
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd9)) {
        offset += 2;
        continue;
      }
      // SOFn is the frame header. 0xC4 (DHT), 0xC8 (JPG) and 0xCC (DAC) sit in
      // the same numeric range and are not frame headers.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        // Height precedes width, after the length word and the precision byte.
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }

  return null;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/image-budget.test.mjs`

Expected: PASS — 5 tests.

- [ ] **Step 5: Commit**

```bash
git add tools/image-budget.mjs tools/image-budget.test.mjs
git commit -m "feat(tools): read image dimensions from the file header"
```

---

## Task 2: The budget audit and the exemption list

**Files:**
- Modify: `tools/image-budget.mjs`
- Modify: `tools/image-budget.test.mjs`

Three things need deciding here, and they are decided:

**Exemption is by basename**, matching how CLAUDE.md names the exempt files and
how the deploy tool protects `.env` at any depth. Two of the four exempt names —
`comite.jpg` and `Flyer.jpeg` — are **not in the tree today**; they were deleted
in `de750d9`. They stay listed so that restoring them does not trip a guard that
was never about them, and a listed name matching no file prints a note rather
than failing, because "absent between rounds" is not an error.

**Exempt files still have a ceiling — 2 MB or 4000px — and this goes beyond the
spec.** The spec's exemption is by name, full stop. But the exemption's stated
reason is "these are already small, and re-encoding a small image only softens
it", which does not hold for a *different* file arriving under the same name.
The band is about to hand over eight new photographs; one of them being called
`comite.jpg` is not a stretch, and under a name-only exemption a 19.8 MB
original would sail through the guard whose entire purpose is to stop exactly
that. One constant and one branch closes it. **Flag this in the PR** — it is a
deliberate strengthening, and it is the one thing here a reviewer should be
given the chance to say no to.

**The walk recurses.** The directory is flat today; eight new photographs
arriving in a subdirectory is the obvious next shape, and a guard that silently
stops looking one level down is worse than no guard.

- [ ] **Step 1: Write the failing test**

Append to `tools/image-budget.test.mjs` — the new `import` statements go at the
**top** of the file with the existing ones, not where they appear below:

```js
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { audit, MAX_BYTES, MAX_EDGE } from './image-budget.mjs';

/** A throwaway image directory. node:test gives each test its own. */
function fixture(files) {
  const dir = mkdtempSync(join(tmpdir(), 'image-budget-'));
  for (const [name, contents] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, contents);
  }
  return dir;
}

test('an image inside the budget passes', () => {
  const dir = fixture({ 'registre.jpg': jpeg(1920, 1275, 400 * 1024) });

  assert.deepEqual(audit(dir).offenders, []);
});

test('an image over the pixel budget fails, and is named', () => {
  // directionmusicale.jpg, the file CLAUDE.md names: 6048x4024.
  const dir = fixture({ 'directionmusicale.jpg': jpeg(6048, 4024, 100 * 1024) });

  const [offender, ...rest] = audit(dir).offenders;
  assert.deepEqual(rest, []);
  assert.equal(offender.file, 'directionmusicale.jpg');
  assert.match(offender.problem, /6048x4024/);
  assert.match(offender.problem, new RegExp(String(MAX_EDGE)));
});

test('a portrait image is measured on its longest edge', () => {
  // 1277x1920 is inside the budget; 1277x4024 is not. A guard that only looked
  // at width would pass a 4000px-tall original.
  assert.deepEqual(audit(fixture({ 'lyre.jpg': jpeg(1277, 1920) })).offenders, []);
  assert.equal(audit(fixture({ 'lyre.jpg': jpeg(1277, 4024) })).offenders.length, 1);
});

test('an image over the file-size budget fails, and is named', () => {
  const dir = fixture({ 'batteurs.jpg': jpeg(1600, 1067, MAX_BYTES + 1) });

  const [offender] = audit(dir).offenders;
  assert.equal(offender.file, 'batteurs.jpg');
  assert.match(offender.problem, /KB/);
});

test('a format it cannot measure is still size-checked', () => {
  const oversized = Buffer.alloc(MAX_BYTES + 1);
  oversized.write('RIFF', 0, 'ascii');
  const dir = fixture({ 'hero.webp': oversized });

  assert.equal(audit(dir).offenders.length, 1);
});

test('it recurses into subdirectories', () => {
  const dir = fixture({ 'registres/trompettes.jpg': jpeg(6048, 4024) });

  assert.deepEqual(
    audit(dir).offenders.map((o) => o.file),
    ['registres/trompettes.jpg'],
  );
});

test('it ignores files that are not images', () => {
  const dir = fixture({ 'README.md': Buffer.alloc(MAX_BYTES + 1) });

  assert.deepEqual(audit(dir).offenders, []);
});

test('an exempt file is not held to the budget', () => {
  // CD_img.png is 536x489 and 344 KB today; the exemption is what keeps a
  // future re-encode of it from being suggested by this guard.
  const dir = fixture({ 'CD_img.png': png(2400, 2400, MAX_BYTES + 1) });

  assert.deepEqual(audit(dir).offenders, []);
});

test('an exempt name does not excuse a camera original arriving under it', () => {
  // The exemption's reason is "already small". A 19.8 MB 6048x4024 file called
  // comite.jpg is a different file, and is exactly what this guard is for.
  const dir = fixture({ 'comite.jpg': jpeg(6048, 4024, 4 * 1024 * 1024) });

  const [offender] = audit(dir).offenders;
  assert.equal(offender.file, 'comite.jpg');
});

test('an exemption matching no file is reported, not failed', () => {
  // comite.jpg and Flyer.jpeg went in de750d9. They stay listed so a restore
  // does not trip a guard that was never about them.
  const { offenders, staleExemptions } = audit(fixture({ 'registre.jpg': jpeg(1600, 1067) }));

  assert.deepEqual(offenders, []);
  assert.ok(staleExemptions.includes('comite.jpg'));
});

test('the repository tree passes its own guard', () => {
  // The assertion that makes this guard real rather than theoretical.
  assert.deepEqual(audit('web/public/assets/img').offenders, []);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/image-budget.test.mjs`

Expected: FAIL — `SyntaxError: The requested module './image-budget.mjs' does not provide an export named 'audit'`.

- [ ] **Step 3: Write the minimal implementation**

Append to `tools/image-budget.mjs` (below `readDimensions`):

```js
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

export const MAX_EDGE = 1920;
export const MAX_BYTES = 600 * 1024;

// Even an exempt file may not be a camera original. The exemption's reason is
// "this one is already small, and re-encoding a small image only softens it" --
// which says nothing about a DIFFERENT file arriving under the same name. The
// band is about to hand over eight new photographs.
const CEILING_EDGE = 4000;
const CEILING_BYTES = 2 * 1024 * 1024;

/**
 * Exempt by basename, with the reason beside each -- the same shape as the
 * commented-out routes in web/src/routes.tsx. Adding one is meant to be a
 * deliberate, reviewable act rather than a threshold nudge.
 *
 * comite.jpg and Flyer.jpeg are not in the tree; they went in de750d9. They
 * stay listed so restoring them does not trip a guard that was never about
 * them. A listed name matching no file is reported, not failed.
 */
const EXEMPT = {
  'Les_Canetons_Fribourg_logo_2.jpg': 'the band identity at 237x174, not a photograph that can go stale',
  'CD_img.png': 'the CD sleeve, already 536x489',
  'comite.jpg': 'already small (CLAUDE.md); absent from the tree since de750d9',
  'Flyer.jpeg': 'already small (CLAUDE.md); absent from the tree since de750d9',
};

const IMAGE = /\.(jpe?g|png|gif|webp|avif)$/i;

const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

/**
 * Every image under `dir` that breaks the budget, plus any exemption that
 * matched no file.
 */
export function audit(dir) {
  const offenders = [];
  const seen = new Set();

  for (const entry of readdirSync(dir, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !IMAGE.test(entry.name)) continue;

    const path = join(entry.parentPath, entry.name);
    const file = relative(dir, path).split('\\').join('/');
    const exempt = EXEMPT[entry.name];
    if (exempt) seen.add(entry.name);

    const maxEdge = exempt ? CEILING_EDGE : MAX_EDGE;
    const maxBytes = exempt ? CEILING_BYTES : MAX_BYTES;

    const contents = readFileSync(path);
    const size = readDimensions(contents);

    if (size && Math.max(size.width, size.height) > maxEdge) {
      offenders.push({
        file,
        problem: `${size.width}x${size.height} — the longest edge may not exceed ${maxEdge}px`,
      });
    } else if (contents.length > maxBytes) {
      // `else if`, so one oversized original is reported once, by its cause.
      offenders.push({
        file,
        problem: `${kb(contents.length)} — the budget is ${kb(maxBytes)}`,
      });
    }
  }

  return {
    offenders,
    staleExemptions: Object.keys(EXEMPT).filter((name) => !seen.has(name)),
  };
}
```

Note the `import` statements belong at the top of the file with the others —
move them there rather than leaving them mid-file.

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/image-budget.test.mjs`

Expected: PASS — 16 tests. If `entry.parentPath` is undefined, this Node build
predates 20.12; use `entry.path` instead and note it in the file.

- [ ] **Step 5: Commit**

```bash
git add tools/image-budget.mjs tools/image-budget.test.mjs
git commit -m "feat(tools): audit web/public/assets/img against the image budget"
```

---

## Task 3: The CLI, and wiring it into `npm run check`

**Files:**
- Modify: `tools/image-budget.mjs`
- Modify: `tools/image-budget.test.mjs`
- Modify: `package.json:44` (the `check` script) and the script list above it

- [ ] **Step 1: Write the failing test**

Append to `tools/image-budget.test.mjs`, with the import moved to the top of the
file beside the others:

```js
import { execFileSync } from 'node:child_process';

const run = (...args) => {
  try {
    return { status: 0, out: execFileSync(process.execPath, ['tools/image-budget.mjs', ...args], { encoding: 'utf8' }) };
  } catch (error) {
    return { status: error.status, out: `${error.stdout}${error.stderr}` };
  }
};

test('the CLI passes the repository tree', () => {
  const { status, out } = run();

  assert.equal(status, 0);
  assert.match(out, /OK/);
});

test('the CLI fails, names the file and says why', () => {
  // The failure has to be readable by whoever dropped the file in, which is the
  // whole point of a guard over a comment in CLAUDE.md.
  const dir = fixture({ 'directionmusicale.jpg': jpeg(6048, 4024) });
  const { status, out } = run(dir);

  assert.equal(status, 1);
  assert.match(out, /directionmusicale\.jpg/);
  assert.match(out, /6048x4024/);
  assert.match(out, /1920/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test tools/image-budget.test.mjs`

Expected: FAIL — the CLI exits 0 and prints nothing, so `assert.match(out, /OK/)` fails.

- [ ] **Step 3: Write the minimal implementation**

Append to `tools/image-budget.mjs`:

```js
// The CLI. Guarded so that importing this module from the test does not run it.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const dir = process.argv[2] ?? 'web/public/assets/img';
  const { offenders, staleExemptions } = audit(dir);

  for (const name of staleExemptions) {
    console.log(`Image budget: note — ${name} is exempt but is not in ${dir}.`);
  }

  if (offenders.length > 0) {
    console.error('Image budget FAILED — re-encode these before committing:');
    for (const { file, problem } of offenders) console.error(`  ${file}: ${problem}`);
    console.error('');
    console.error('The budget is in CLAUDE.md: longest edge 1920px, JPEG quality 82,');
    console.error('progressive, no EXIF. Re-encoding is generational — never run a');
    console.error('second pass over an already-optimised file.');
    process.exit(1);
  }

  console.log(`Image budget: OK (every image in ${dir} is within budget).`);
}
```

Add `pathToFileURL` to the imports at the top:

```js
import { pathToFileURL } from 'node:url';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test tools/image-budget.test.mjs`

Expected: PASS — 18 tests.

- [ ] **Step 5: Wire it into `npm run check`**

In `package.json`, beside the existing `guard` script:

```json
    "guard": "node tools/secret-guard.mjs",
    "guard:images": "node tools/image-budget.mjs",
```

and append it to `check`, after `guard`:

```json
    "check": "npm run lint:api && npm run typecheck && npm run test:js && npm run test:web && npm run lint:js && npm run lint:css && npm run format:check && npm run guard && npm run guard:images",
```

`test:js` already globs `tools/*.test.mjs`, so the new test file needs no
registration.

- [ ] **Step 6: Verify both entry points**

Run: `npm run guard:images && npm run test:js`

Expected: `Image budget: note — comite.jpg is exempt but is not in web/public/assets/img.`, the same for `Flyer.jpeg`, then `Image budget: OK`, then the whole `tools/` suite green.

- [ ] **Step 7: Commit**

```bash
git add tools/image-budget.mjs tools/image-budget.test.mjs package.json
git commit -m "feat(tools): fail npm run check on an over-budget image"
```

---

## Task 4: `PhotoPending` becomes one line

Eight placeholders cost 1280px of `/canetons` — 42% of the page — for content
that is not there. One line costs about 280px for all eight. Props, the
`data-photo-pending` hook, the `what` sentence and the docblock's reasoning are
all unchanged; this changes only what an *absence* costs, which is why
`/accueil` and `/moniteurs` can inherit it untouched.

**Files:**
- Modify: `web/src/components/PhotoPending.tsx:19-29`
- Create: `web/src/components/PhotoPending.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/PhotoPending.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import { expect, test } from "vitest";

import { PhotoPending } from "./PhotoPending";

// `what` completes the sentence, so a placeholder always names what is missing.
// A single shared string would read wrong under half the headings it appears
// beneath, and this is what Canetons.test.tsx leans on to catch a label landing
// under the wrong register.
test("it names the photograph that is missing", () => {
  render(<PhotoPending what="des trompettes" />);

  expect(screen.getByText(/Nouvelle photo des trompettes à venir/)).toBeInTheDocument();
});

// `grep -rl "<PhotoPending" web/src/pages` is the to-do list, and this attribute
// is how a rendered page is checked for the same thing.
test("it keeps the data-photo-pending hook, carrying what is awaited", () => {
  const { container } = render(<PhotoPending what="des cloches" />);

  expect(container.querySelector("[data-photo-pending]")).toHaveAttribute(
    "data-photo-pending",
    "des cloches",
  );
});

// E2a's decision, and the one thing about this component that is worth pinning
// in a test: an ABSENT photograph may not cost what a present one would. It was
// a 160px-minimum box, and eight of them were 42% of /canetons. This asserts on
// classes because that is where the height lives -- the honest check is the
// screenshot in Task 7, and this is the regression fence around it.
test("an absence does not reserve a photograph's worth of height", () => {
  const { container } = render(<PhotoPending what="des batteurs" />);
  const className = container.querySelector("[data-photo-pending]")!.className;

  expect(className).not.toMatch(/\bmin-h-/);
  expect(className).not.toMatch(/\baspect-/);
  // Still visibly a placeholder rather than ordinary copy.
  expect(className).toMatch(/border-dashed/);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from **PowerShell**, not Git Bash — see CLAUDE.md):
`npx vitest run web/src/components/PhotoPending.test.tsx`

Expected: FAIL — one test, "an absence does not reserve a photograph's worth of
height": the className contains `min-h-40`.

- [ ] **Step 3: Write the minimal implementation**

In `web/src/components/PhotoPending.tsx`, replace the returned markup (the
docblock above it is unchanged — its reasoning about why every photograph went
at once still holds):

```tsx
export function PhotoPending({ what }: { what: string }) {
  return (
    // ONE LINE, NOT A BOX. This was a 160px-minimum panel, and /canetons shows
    // eight of them: 1280px, 42% of the page, reserved for content that is not
    // there. The photographed page is LONGER than the placeholder page, so the
    // height was never standing in for anything -- see the E2a spec. Dashed and
    // muted so it still reads as a gap rather than as copy.
    <p
      className="mt-4 rounded-lg border border-dashed border-line bg-panel px-3 py-2 text-sm text-ink-muted"
      data-photo-pending={what}
    >
      Nouvelle photo {what} à venir&nbsp;! <span aria-hidden="true">📷</span>
    </p>
  );
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run web/src/components/PhotoPending.test.tsx web/src/pages/Canetons.test.tsx web/src/pages/Accueil.test.tsx`

Expected: PASS. `/moniteurs` has no test file; it inherits the change and is
looked at in Task 7.

- [ ] **Step 5: Commit**

```bash
git add web/src/components/PhotoPending.tsx web/src/components/PhotoPending.test.tsx
git commit -m "feat(web): a pending photograph costs one line, not 160px"
```

---

## Task 5: The `RegisterIndex` component

A row of jump links. It takes its entries as a prop and knows nothing about
registers — the page owns that list, and this is the same split as `StatTile`,
which knows a label and a number and nothing about summaries.

**Files:**
- Create: `web/src/components/RegisterIndex.tsx`
- Create: `web/src/components/RegisterIndex.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `web/src/components/RegisterIndex.test.tsx`:

```tsx
import { render, screen, within } from "@testing-library/react";
import { expect, test } from "vitest";

import { RegisterIndex } from "./RegisterIndex";

const ENTRIES = [
  { id: "direction", label: "Direction" },
  { id: "drums", label: "Batteurs" },
  { id: "lyre", label: "Lyre" },
];

test("it renders one link per entry, in the order given", () => {
  render(<RegisterIndex entries={ENTRIES} />);
  const nav = screen.getByRole("navigation", { name: "Registres" });

  expect(
    within(nav)
      .getAllByRole("link")
      .map((link) => link.textContent),
  ).toEqual(["Direction", "Batteurs", "Lyre"]);
});

// A same-page fragment, not a router Link: react-router would treat "#drums" as
// a route and the browser's own anchor handling -- which is what actually
// scrolls -- would never run.
test("each link is a fragment pointing at its section", () => {
  render(<RegisterIndex entries={ENTRIES} />);

  expect(screen.getByRole("link", { name: "Batteurs" })).toHaveAttribute("href", "#drums");
});

// It sits on a page whose job is to introduce the band; a second unlabelled
// <nav> beside the site navigation is what makes it announce as something.
test("the nav is named", () => {
  render(<RegisterIndex entries={ENTRIES} />);

  expect(screen.getByRole("navigation", { name: "Registres" })).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run web/src/components/RegisterIndex.test.tsx`

Expected: FAIL — `Failed to resolve import "./RegisterIndex"`.

- [ ] **Step 3: Write the minimal implementation**

Create `web/src/components/RegisterIndex.tsx`:

```tsx
/**
 * Jump links to each register on /canetons.
 *
 * WHY A LONG PAGE GETS AN INDEX RATHER THAN BEING SHORTENED. One photograph per
 * register is a requirement carried from the legacy site, and the photographs
 * are coming back -- so the page has to be designed PHOTOGRAPHED. Measured, the
 * photographed page is ~3554px at 390px against today's 3034px: the length is
 * inherent to the requirement, not a placeholder artefact. What the page lacked
 * was a way in. See the E2a spec for the two alternatives that were rejected
 * (side-by-side registers, and disclosures).
 *
 * It knows nothing about registers -- the page owns that list -- so the same
 * component works whether the photographs are present or pending.
 */
export function RegisterIndex({ entries }: { entries: { id: string; label: string }[] }) {
  return (
    // aria-label because this is the page's SECOND nav; the site's own is
    // "Menu de navigation" and two unnamed navs are indistinguishable to a
    // screen reader.
    <nav aria-label="Registres" className="mt-6">
      <ul className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            {/*
              A plain <a>, not a router Link: react-router would treat "#drums"
              as a route. A same-page fragment is the browser's own job, and
              nothing in this app intercepts it -- there is no scroll
              restoration and the header is not sticky.
            */}
            <a
              href={`#${entry.id}`}
              className="focus-ring flex min-h-touch items-center rounded-full border border-line bg-panel px-3 text-sm text-ink hover:border-violet hover:text-violet"
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run web/src/components/RegisterIndex.test.tsx`

Expected: PASS — 3 tests.

- [ ] **Step 5: Verify `focus-ring` and `min-h-touch` exist**

Run: `grep -n "focus-ring\|min-h-touch\|--spacing-touch" web/src/styles.css`

Both are used by `Layout.tsx` already. If either is absent under those exact
names, use whatever `Layout.tsx`'s nav links use — do not invent a token.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/RegisterIndex.tsx web/src/components/RegisterIndex.test.tsx
git commit -m "feat(web): add the register index component"
```

---

## Task 6: Wire the index into `/canetons`

**Files:**
- Modify: `web/src/pages/Canetons.tsx:37-64`
- Modify: `web/src/pages/Canetons.test.tsx`

The `id`s are **English** — `direction`, `drums`, `bass-drums`, `lyre`, `bells`,
`trumpets`, `trombones`. CLAUDE.md puts identifiers and slugs in English and
reserves French for user-visible text; the visible text here is the `label` and
the heading. The French URLs are a separate thing: they are carried from the
legacy site deliberately, and these anchors have no legacy to carry.

- [ ] **Step 1: Write the failing test**

Append to `web/src/pages/Canetons.test.tsx`:

```tsx
// THE ASSERTION THAT CATCHES A RENAMED ANCHOR. An index link whose target id no
// longer exists is a dead link that renders perfectly and scrolls nowhere --
// invisible to every other test on this page, and to a screenshot.
test("every index link points at a section that exists", () => {
  const { container } = render(<Canetons />);
  const nav = screen.getByRole("navigation", { name: "Registres" });
  const links = [...nav.querySelectorAll("a")];

  expect(links).toHaveLength(7);
  for (const link of links) {
    const id = link.getAttribute("href")!.slice(1);
    expect(container.querySelector(`#${id}`)).not.toBeNull();
  }
});

// The index is a way into the register list, so it has to be in the list's
// order -- a shuffled index is worse than none.
test("the index is in the registers' order", () => {
  render(<Canetons />);
  const nav = screen.getByRole("navigation", { name: "Registres" });

  expect([...nav.querySelectorAll("a")].map((a) => a.textContent)).toEqual([
    "Direction",
    "Batteurs",
    "Grosses-caisses",
    "Lyre",
    "Cloches",
    "Trompettes",
    "Trombones",
  ]);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run web/src/pages/Canetons.test.tsx`

Expected: FAIL — two tests, `Unable to find an accessible element with the role "navigation" and name "Registres"`.

- [ ] **Step 3: Write the minimal implementation**

In `web/src/pages/Canetons.tsx`, add the import:

```tsx
import { RegisterIndex } from "@/components/RegisterIndex";
```

Extend the `REGISTERS` type and every entry. Add this paragraph to the existing
docblock above it, after the `roster` paragraph:

```
 * `id` anchors the register index above the list, and is ENGLISH because
 * CLAUDE.md puts identifiers and slugs in English -- the French on this page is
 * the heading and the index's own label, both of which are read. `short` is
 * that label: "Grosses-caisses", not "Nos Grosses-Caisses", because seven full
 * headings do not fit on one row at 390px. Renaming an `id` without renaming
 * the link breaks a jump link silently; Canetons.test.tsx asserts the pairing.
```

```tsx
const REGISTERS: { id: string; short: string; heading: string; photo: string; roster?: string }[] = [
  {
    id: "direction",
    short: "Direction",
    heading: "La Direction Musicale",
    photo: "de la direction musicale",
    roster: "Lilou et Anaïs",
  },
  { id: "drums", short: "Batteurs", heading: "Nos Batteurs", photo: "des batteurs" },
  {
    id: "bass-drums",
    short: "Grosses-caisses",
    heading: "Nos Grosses-Caisses",
    photo: "des grosses-caisses",
  },
  { id: "lyre", short: "Lyre", heading: "Notre Lyre", photo: "de la lyre" },
  { id: "bells", short: "Cloches", heading: "Nos Cloches", photo: "des cloches" },
  { id: "trumpets", short: "Trompettes", heading: "Nos Trompettes", photo: "des trompettes" },
  { id: "trombones", short: "Trombones", heading: "Nos Trombones", photo: "des trombones" },
];
```

Then the render — the index goes above the list, and each `<article>` takes its
`id`:

```tsx
export function Canetons() {
  return (
    <PageSection width="text">
      <h1 className="font-display text-4xl">Nos Canetons</h1>
      <PhotoPending what="des Canetons au complet" />
      <RegisterIndex entries={REGISTERS.map(({ id, short }) => ({ id, label: short }))} />

      <div className="mt-10 space-y-10">
        {REGISTERS.map((register) => (
          // scroll-mt so a jumped-to heading is not flush against the top of
          // the viewport. NOT an offset for a sticky header -- this site's
          // header scrolls away with the page.
          <article key={register.id} id={register.id} className="scroll-mt-6">
            <h2 className="font-display text-2xl">{register.heading}</h2>
            <PhotoPending what={register.photo} />
            <p className="mt-2 text-ink-muted">
              {register.roster ?? <Tbd what="prénoms du registre" />}
            </p>
          </article>
        ))}
      </div>
```

The rest of the component — the `<hr>`, the parrain/marraine `Card` and its long
comment — is unchanged.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run web/src/pages/Canetons.test.tsx`

Expected: PASS — 8 tests. The six pre-existing ones must still pass; if the
"every register has a section" test now fails, the register set was changed,
which this task must not do.

- [ ] **Step 5: Commit**

```bash
git add web/src/pages/Canetons.tsx web/src/pages/Canetons.test.tsx
git commit -m "feat(web): give /canetons a register index"
```

---

## Task 7: Look at the page

**A green suite is not a rendered page.** E1 shipped four defects a green suite
could not see; `docs/continue-here.md` records them. The spec is explicit that
the index and the slimmed placeholder both have to be read at 390px and 1280px
before this is called done.

**Files:** none — this task produces screenshots and, if it finds something, a
fix committed under Task 6's files.

- [ ] **Step 1: Start the mocked dev server**

Run: `npx vite --mode mock --port 5199 --strictPort`

Not `npm run dev:mock`: something else on this machine already answers on :5173
with a 302 to `/assets/dist/`, which looks like the app half-working.

- [ ] **Step 2: Screenshot `/canetons`, `/accueil` and `/moniteurs` at both widths**

Write this to the scratchpad and run it with `node`. The Playwright import must
be an **absolute** file URL — a script in the scratchpad cannot resolve
`@playwright/test`:

```js
import { chromium } from "file:///c:/Workspace/website-les-canetons/node_modules/playwright/index.mjs";

const browser = await chromium.launch();
for (const [name, viewport] of [
  ["phone", { width: 390, height: 844 }],
  ["desktop", { width: 1280, height: 900 }],
]) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  for (const route of ["/canetons", "/", "/moniteurs"]) {
    await page.goto(`http://localhost:5199${route}`);
    await page.waitForLoadState("networkidle");
    const slug = route === "/" ? "accueil" : route.slice(1);
    await page.screenshot({ path: `shots/${slug}-${name}.png`, fullPage: true });
  }
  await context.close();
}
await browser.close();
```

- [ ] **Step 3: Read the screenshots and check the measurements**

Open each PNG. What has to be true:

- The index reads as one or two rows of tappable chips at 390px, not a ragged
  seven-line stack. If it wraps to more than two rows, the labels are too long —
  shorten `short`, not the heading.
- Each chip is at least 44px tall (`min-h-touch`), because this is a phone page.
- The eight placeholders are single lines. `/canetons` should now measure roughly
  1900px at 390px, down from 3034px — a number to sanity-check the change, not
  an acceptance criterion.
- `/accueil` and `/moniteurs` inherit the slimmer placeholder and still read
  correctly. `/moniteurs` has no test file at all, so this screenshot is its
  only coverage.

- [ ] **Step 4: Prove the jump links actually work**

A dead anchor renders perfectly. In the same script, or by hand in the browser
at :5199:

```js
const page = await context.newPage();
await page.goto("http://localhost:5199/canetons");
await page.getByRole("navigation", { name: "Registres" }).getByRole("link", { name: "Trombones" }).click();
console.log(await page.evaluate(() => window.scrollY));   // must be > 0
console.log(page.url());                                   // must end in #trombones
```

- [ ] **Step 5: Commit any fix the screenshots found**

If nothing needed fixing, there is nothing to commit — say so rather than
inventing a commit.

---

## Task 8: Record that the budget is now enforced

`CLAUDE.md` currently says nothing in the test suite or the linters can catch an
unprocessed original being dropped in. That sentence is now false, and leaving
it would send the next reader looking for a guard they were told does not exist.

**Files:**
- Modify: `CLAUDE.md` (the "Photographs have a budget" bullet under **Architecture**)
- Modify: `docs/superpowers/specs/2026-09-01-e2a-canetons-and-the-image-rule-design.md:4`

- [ ] **Step 1: Update the budget paragraph in `CLAUDE.md`**

Replace the sentence "Nothing in the test suite or the linters can catch an
unprocessed original being dropped in, so it has to be caught here." with:

```
  **`npm run check` enforces this** — `tools/image-budget.mjs` walks
  `web/public/assets/img/`, reads each image's dimensions out of its header and
  fails, naming the file, on anything over 1920px or 600 KB. The exemptions are
  by name in that file, each with its reason; an exempt name is still held to a
  4000px / 2 MB ceiling, so a camera original arriving under an exempt name does
  not sail through.
```

Keep the following sentence about the logo, `comite.jpg`, `CD_img.png` and
`Flyer.jpeg` being exempt, and the one about re-encoding being generational —
both are still true and the guard's comments point back at them.

- [ ] **Step 2: Update the spec's status line**

In `docs/superpowers/specs/2026-09-01-e2a-canetons-and-the-image-rule-design.md`:

```
**Status:** approved — implemented by `docs/superpowers/plans/2026-09-03-e2a-canetons-and-the-image-rule.md`
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-09-01-e2a-canetons-and-the-image-rule-design.md
git commit -m "docs: the image budget is enforced, not just documented"
```

---

## Task 9: Verify and open the PR

- [ ] **Step 1: Run the whole check, from PowerShell**

Run: `npm run check`

**From PowerShell, not Git Bash.** Git Bash reports a lowercase drive letter,
Vitest 4 keys module resolution off it, and every test file fails to collect
with "Vitest failed to find the runner". It looks like a catastrophic
regression; it is neither, and it has already cost two sessions.

Expected: all nine steps green, ending with `Image budget: OK`.

- [ ] **Step 2: Run the e2e suite**

Run: `npm run test:e2e`

Expected: green. `/canetons` is the page most likely to have an e2e spec that
selected on the placeholder box.

- [ ] **Step 3: Push and open the PR**

```bash
git push -u origin feat/e2a-canetons-and-image-rule
gh pr create --title "feat(web): a register index for /canetons, and an enforced image budget" --body-file pr-body.md
```

Write `pr-body.md` in the scratchpad, not the repository, and fill in every
section of `.github/PULL_REQUEST_TEMPLATE.md` — read that file and answer each
heading it contains. Two things must be called out explicitly in the body:

1. **The 4000px / 2 MB ceiling on exempt files goes beyond the spec**, and why —
   the exemption's reason is "this file is already small", which says nothing
   about a different file arriving under the same name, and eight new
   photographs are about to be handed over. It is the one decision here a
   reviewer should get to reverse.
2. **PROD is still blocked on content.** This round fills in no `<Tbd>` and adds
   no photograph. The six "à compléter : prénoms du registre" are still there by
   design.

- [ ] **Step 4: Report CI, and stop**

Do not merge. A merge to `main` auto-deploys TEST, so merging is a deploy and is
André's call.

---

## What this plan deliberately does not do

- **No page-height assertion.** It would pin a number every legitimate content
  change alters, and would not have caught any defect this project has had. The
  height figures above are measurements taken to make a decision.
- **No `<Tbd>` filled in, no photograph added.** PROD stays blocked on content.
- **No change to the register set, their order, or their headings** — all carried
  from the legacy site deliberately.
- **No uniform `aspect-ratio` on the photographs when they return.** The legacy
  captions read "de gauche à droite", so a crop can cut a person out and make the
  caption wrong. The portrait `lyre` will render 538px tall at 390px, accepted.
- **`/accueil` is not touched beyond inheriting the slimmer placeholder** — that
  is E2b.
