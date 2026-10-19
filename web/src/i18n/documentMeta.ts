import { t } from "./index";
import { type Locale } from "./locale";

/**
 * The manifest each locale installs from.
 *
 * Two files differing only in `start_url` and `lang`. "Guggenmusik Les
 * Canetons de Fribourg" is the band's name after a German word, so `name` and
 * `short_name` need no translation.
 *
 * Neither file sets `id`, so `start_url` is the app's identity and the two
 * language editions install as two separate apps.
 */
const MANIFEST: Record<Locale, string> = {
  fr: "/assets/icons/manifest.json",
  "de-CH": "/assets/icons/manifest.de.json",
};

/**
 * Corrects the static shell's metadata for the locale actually being read.
 *
 * Who reads each tag decides what this can fix:
 *
 *   <title>           a person, in their tab: fixed
 *   description       Google, which renders JavaScript: fixed
 *   manifest          the browser at install time, after JS has run: fixed
 *   og:*              WhatsApp, Facebook, Signal, with no JavaScript: untouched
 *   <html lang>, static   a crawler with no JS: untouched (see main.tsx)
 *   <noscript>        a visitor with no JS: untouched
 *
 * The three left alone need two shells and an .htaccess rule; web/index.html
 * gives the reasoning at the tags. Rewriting them here would only look fixed.
 *
 * One code path for both locales, rewriting identical values for French, so
 * the French path is exercised too.
 *
 * A German page paints the shell's French <title> first and then replaces
 * it. The two titles are identical today (documentMeta.test.ts).
 */
export function applyDocumentMeta(locale: Locale): void {
  document.title = t("meta.title");

  const description = document.querySelector('meta[name="description"]');
  if (description) {
    description.setAttribute("content", t("meta.description"));
  }

  // Repointed rather than replaced, to keep crossorigin="use-credentials",
  // without which the fetch fails behind TEST/QA Basic Auth.
  const manifest = document.querySelector('link[rel="manifest"]');
  if (manifest) {
    manifest.setAttribute("href", MANIFEST[locale]);
  }
}
