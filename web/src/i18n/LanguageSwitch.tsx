import { currentLocale, t } from "./index";
import { htmlLang, pathInLocale, type Locale } from "./locale";
import { rememberLocale } from "./preference";

/**
 * What each language calls itself, and the code the header shows for it.
 *
 * The visible labels are codes, "FR" and "DE", as most Swiss sites show them.
 * The endonym is what a screen reader hears for the current language and the
 * link's tooltip. It is not a translation, and so not in the catalogues:
 * somebody who cannot read the current page has to recognise the way out.
 */
const ENDONYM: Record<Locale, string> = {
  fr: "Français",
  "de-CH": "Deutsch",
};
const CODE: Record<Locale, string> = {
  fr: "FR",
  "de-CH": "DE",
};

/** Both languages, in the order the header shows them. */
const ORDER: Locale[] = ["fr", "de-CH"];

/**
 * Where the switcher points, as a string.
 *
 * A pure function, the same seam as `logoutDestination()`: `window.location`
 * is non-configurable in this jsdom setup, so the navigation is not testable.
 *
 * It reads the real browser path, never `useLocation()`, which has `/de`
 * stripped by the router's `basename`.
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
 * "FR DE" in the header, the current language marked.
 *
 * Outside the nav list, so it is visible on every screen size without opening
 * anything, for the German-speaking parent who lands on the French front
 * page: in the black header band on desktop, at the right of the "Menu" bar
 * on a phone. In the band on a phone it would take 88px from the wordmark,
 * which then wraps at 390px.
 *
 * The current language is not a link; it would point at the page you are on.
 *
 * The other one is a real link, not a button. Changing locale is a full page
 * load (`basename` is fixed when the router mounts), and an anchor is
 * middle-clickable and visible to a crawler.
 *
 * `rememberLocale` runs in the click handler, before the navigation.
 * Switching to French from `/de` lands on `/`, where main.tsx's
 * `shouldRedirectToGerman()` would bounce a visitor whose stored preference
 * is still German straight back. localStorage writes synchronously, so the
 * handler finishes before the browser navigates (see preference.ts).
 *
 * Two locales, so a pair rather than a menu.
 */
export function LanguageSwitch() {
  const current = currentLocale();

  return (
    <div role="group" aria-label={t("nav.language")} className="flex items-center text-sm">
      {ORDER.map((locale) =>
        locale === current ? (
          <span
            key={locale}
            aria-current="true"
            className="inline-flex min-h-touch min-w-touch items-center justify-center"
          >
            <span
              aria-hidden="true"
              className="rounded bg-white px-2 py-1 leading-none font-semibold text-stage"
            >
              {CODE[locale]}
            </span>
            <span className="sr-only">{ENDONYM[locale]}</span>
          </span>
        ) : (
          <a
            key={locale}
            href={switchDestination(locale)}
            // Both name the target: `hrefLang` tells a crawler what is on the
            // other end, and `lang` stops a screen reader using the page's
            // voice.
            hrefLang={htmlLang(locale)}
            lang={htmlLang(locale)}
            title={ENDONYM[locale]}
            aria-label={t(locale === "de-CH" ? "nav.switchToGerman" : "nav.switchToFrench")}
            onClick={() => rememberLocale(locale)}
            className="focus-ring-stage inline-flex min-h-touch min-w-touch items-center justify-center rounded text-white/70 hover:text-white"
          >
            <span className="px-2 py-1 leading-none font-semibold">{CODE[locale]}</span>
          </a>
        ),
      )}
    </div>
  );
}
