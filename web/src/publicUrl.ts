/**
 * The URL of a file in web/public/, such as `assets/img/duck-white.png`.
 *
 * A root-absolute path such as /assets/… only works where the app owns the
 * origin's root. A PR preview serves it from a subpath of GitHub Pages
 * (#353), where such a path resolves to the Pages root and 404s. Vite
 * rewrites these URLs in index.html and in CSS, but not in a string in the
 * code, so every one goes through here. tools/public-url.test.mjs checks.
 */
export function publicUrl(path: string): string {
  return `${import.meta.env.BASE_URL}${path}`;
}
