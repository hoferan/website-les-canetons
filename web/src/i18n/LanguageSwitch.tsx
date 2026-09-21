import { currentLocale, t } from "./index";
import { htmlLang, pathInLocale, type Locale } from "./locale";
import { rememberLocale } from "./preference";

/**
 * What each language calls itself.
 *
 * AN ENDONYM, NOT A TRANSLATION, and therefore not in the catalogues: the
 * control on a French page reads "Deutsch" and the one on a German page reads
 * "Français". Labelling the target in the target's own language is what lets
 * somebody who cannot read the current page recognise the way out — which is
 * the entire job of this control.
 */
const ENDONYM: Record<Locale, string> = {
  fr: "Français",
  "de-CH": "Deutsch",
};

/**
 * Where the switcher points, as a string.
 *
 * A PURE FUNCTION BECAUSE THE NAVIGATION IS NOT TESTABLE HERE — the same seam
 * `logoutDestination()` carves out, for the same reason: `window.location` is
 * non-configurable in this jsdom setup, so nothing can stand in for it.
 *
 * IT READS THE REAL BROWSER PATH, never `useLocation()`. The router is mounted
 * under a `basename`, so `useLocation()` has already had `/de` stripped off
 * and would send every German page back to itself.
 *
 * Search and hash travel: switching language on `/events?past=1` should keep
 * showing past events.
 */
export function switchDestination(
  target: Locale,
  at: { pathname: string; search: string; hash: string } = window.location,
): string {
  return `${pathInLocale(at.pathname, target)}${at.search}${at.hash}`;
}

/**
 * The one control that advertises the other language.
 *
 * A REAL LINK, NOT A BUTTON. Changing locale is a full page load — `basename`
 * is fixed when the router mounts — so this is a navigation, and an anchor is
 * what makes it middle-clickable, openable in a new tab, and visible to a
 * crawler following the `hreflang` alternates beside it.
 *
 * `rememberLocale` IS WRITTEN IN THE CLICK HANDLER, AND THE ORDER IS
 * LOAD-BEARING. Switching to French from `/de` lands on `/`, where main.tsx
 * asks `shouldRedirectToGerman()` — which would bounce the visitor straight
 * back to `/de` if the stored preference were still German. localStorage
 * writes synchronously, so the handler completing before the browser navigates
 * is what makes this safe. preference.ts's own docblock carries the warning;
 * this is the call site it was written for.
 *
 * TWO LOCALES, SO A TOGGLE RATHER THAN A MENU. That also keeps this
 * independent of #99, which is adding the first dropdown primitive to the
 * project — a third language is when this becomes a menu, and not before.
 */
export function LanguageSwitch({ onDone }: { onDone?: () => void }) {
  const target: Locale = currentLocale() === "fr" ? "de-CH" : "fr";
  const href = switchDestination(target);

  return (
    <a
      href={href}
      // Both of these name the TARGET, which is the point: `hrefLang` tells a
      // crawler what is on the other end, and `lang` stops a screen reader
      // pronouncing "Deutsch" with a French voice.
      hrefLang={htmlLang(target)}
      lang={htmlLang(target)}
      aria-label={t(target === "de-CH" ? "nav.switchToGerman" : "nav.switchToFrench")}
      onClick={() => {
        rememberLocale(target);
        onDone?.();
      }}
      className="focus-ring flex min-h-12 items-center px-4 text-white/80 hover:text-white md:min-h-0 md:px-0 md:py-1 md:text-ink-muted md:hover:text-ink"
    >
      {ENDONYM[target]}
    </a>
  );
}
