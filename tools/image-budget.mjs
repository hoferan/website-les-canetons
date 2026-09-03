// Fails if any image in web/public/assets/img/ breaks the documented budget.
//
// WHY THIS EXISTS. CLAUDE.md documents the budget -- longest edge 1920px, JPEG
// quality 82, progressive, no EXIF, roughly 300-600 KB -- and used to say in as
// many words that nothing in the test suite or the linters could catch an
// unprocessed original being dropped in. That was true, and it cost 44.5 MB
// once already: the legacy /canetons still serves eight photographs totalling
// 37.5 MB, including a 19.8 MB 6048x4024 camera original. The band is about to
// re-shoot those eight and hand them over. This is what stops them arriving raw.
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
      if (
        marker >= 0xc0 &&
        marker <= 0xcf &&
        marker !== 0xc4 &&
        marker !== 0xc8 &&
        marker !== 0xcc
      ) {
        // Height precedes width, after the length word and the precision byte.
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }

  return null;
}
