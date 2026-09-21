import { t } from "./index";
import { type Locale } from "./locale";

/**
 * The manifest each locale installs from.
 *
 * TWO FILES DIFFERING BY ONE FIELD, `start_url`. "Guggenmusik Les Canetons de
 * Fribourg" is the band's name preceded by a German word, so `name` and
 * `short_name` need no translation — the only thing a German install has to get
 * right is where it launches.
 *
 * Neither file sets `id`, so `start_url` IS the app's identity and the two
 * install as two separate apps. That is correct: they are two language
 * editions, and somebody who installs both wanted both.
 */
const MANIFEST: Record<Locale, string> = {
  fr: "/assets/icons/manifest.json",
  "de-CH": "/assets/icons/manifest.de.json",
};

/**
 * Corrects the static shell's metadata for the locale actually being read.
 *
 * WHAT THIS CAN AND CANNOT FIX is the whole design, and it is decided by who
 * reads each tag rather than by how hard each one is:
 *
 *   <title>           a person, in their tab — WORKS
 *   description       Google, which renders JavaScript — WORKS
 *   manifest          the browser at install time, after JS has run — WORKS
 *   og:*              WhatsApp, Facebook, Signal — NO JAVASCRIPT, so untouched
 *   <html lang>, static   a crawler with no JS — untouched (see main.tsx)
 *   <noscript>        a visitor with no JS, by definition — untouched
 *
 * The three left alone need two shells and an .htaccess rule to fix; the
 * reasoning is in web/index.html, at the tags themselves. Rewriting them here
 * would read as fixed without being fixed.
 *
 * IT RUNS FOR BOTH LOCALES, ONE CODE PATH. For French it rewrites identical
 * values. A `locale === "de-CH"` guard would mean the French path was never
 * exercised anywhere, and the first bug in it would ship.
 *
 * THE FRENCH TITLE IS PAINTED FIRST AND THEN REPLACED on a German page. One
 * shell carries one static <title>, so that is unavoidable — the same
 * compromise as <html lang> being corrected at runtime rather than served
 * right. Today it is invisible: the two titles are identical (see i18n/fr.ts).
 */
export function applyDocumentMeta(locale: Locale): void {
  document.title = t("meta.title");

  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute("content", t("meta.description"));
  }

  // Queried rather than assumed: the link carries crossorigin="use-credentials"
  // and that attribute is load-bearing behind TEST/QA Basic Auth, so this
  // repoints the existing element instead of replacing it.
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) {
    manifest.setAttribute("href", MANIFEST[locale]);
  }
}
