import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { audit, MAX_BYTES, MAX_EDGE, readDimensions } from './image-budget.mjs';

// Fixture builders. These are HEADERS, not decodable images -- the guard reads
// headers, so a header is all a fixture needs, and building one by hand is what
// lets these tests run with no image library and no binary files in git.

/**
 * SOI, one SOF0 frame header carrying the dimensions, then EOI.
 * `bytes` pads the file out afterwards, for the file-size tests below.
 */
function jpeg(width, height, bytes = 0) {
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
function png(width, height, bytes = 0) {
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
  const withApp0 = Buffer.concat([
    jpeg(4000, 3000).subarray(0, 2),
    app0,
    jpeg(4000, 3000).subarray(2),
  ]);

  assert.deepEqual(readDimensions(withApp0), { width: 4000, height: 3000 });
});

test('returns null for a format it cannot measure', () => {
  // A .webp or an .svg is not an error -- the file-size budget still applies to
  // it, and the audit relies on null meaning "size-check only".
  assert.equal(readDimensions(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" />')), null);
});

/** A throwaway image directory. Each test gets its own. */
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
