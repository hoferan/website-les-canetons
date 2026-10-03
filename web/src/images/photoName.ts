import { t } from "../i18n";

/** The longest name the API stores, in characters (`max:120` on `name`). */
export const MAX_NAME_LENGTH = 120;

/**
 * What the server refuses in a name (App\Support\PhotoName): control
 * characters and the bidirectional marks, embeddings, overrides and isolates.
 * A file name can carry them: an override (U+202E) followed by "gpj.exe" is
 * the old trick that makes a program's name read as a JPEG's. They are
 * dropped before the upload.
 */
export const REFUSED = /[\p{Cc}\u200E\u200F\u202A-\u202E\u2066-\u2069]/gu;

/**
 * The name a photo is uploaded under: its file name without the extension,
 * trimmed, with every run of whitespace made one space, every character the
 * server refuses dropped, and cut to what the server accepts. Counted in code
 * points, as Laravel's `max` counts, so an emoji is never cut in half. A file
 * named only ".jpg" is called "Photo".
 */
export function nameFromFile(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  const stem = dot > 0 ? fileName.slice(0, dot) : dot === 0 ? "" : fileName;
  const name = Array.from(stem.replace(/\s+/g, " ").replace(REFUSED, "").trim())
    .slice(0, MAX_NAME_LENGTH)
    .join("")
    .trimEnd();
  return name === "" ? t("photos.defaultName") : name;
}

/**
 * The file name a download of the photo is saved under: its name with every
 * character a file system refuses (and every control character) made a space,
 * and ".jpg" after it. Windows also refuses a name ending in a dot or a space.
 */
export function downloadName(name: string): string {
  const safe = Array.from(name)
    .map((char) => (/[<>:"/\\|?*]/.test(char) || char.charCodeAt(0) < 32 ? " " : char))
    .join("")
    .replace(/\s+/g, " ")
    .replace(/^[\s.]+|[\s.]+$/g, "");
  return `${safe === "" ? t("photos.defaultName") : safe}.jpg`;
}
