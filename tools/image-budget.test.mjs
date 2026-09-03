import assert from 'node:assert/strict';
import test from 'node:test';

import { readDimensions } from './image-budget.mjs';

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
