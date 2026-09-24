import { currentLocale, t } from "./index";
import { htmlLang, pathInLocale, type Locale } from "./locale";
import { rememberLocale } from "./preference";

/**
 * What each language calls itself, and the code the header shows for it.
 *
 * The visible labels are codes, "FR" and "DE", the way the canton's own site
 * and most Swiss sites show them. The endonym is what a screen reader hears for
 * the current language and what a pointer sees as the link's tooltip: an
 * ENDONYM, NOT A TRANSLATION, and so not in the catalogues, because somebody
 * who cannot read the current page has to recognise the way out of it.
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
 * "FR DE" in the header, the current language marked.
 *
 * OUT OF THE NAV LIST (#99). It used to be a nav item reading only "Deutsch",
 * which said nothing about the page's own language and, on a phone, sat behind
 * the hamburger as the last row. It is now visible on every screen size
 * without opening anything, which matters most to the German-speaking parent
 * who lands on the French front page: in the black header band on desktop,
 * and on a phone at the right of the white "Menu" bar. In the band on a phone
 * it took 88px from the wordmark, which then wrapped to two lines at 390px and
 * three at 320px.
 *
 * THE CURRENT LANGUAGE IS NOT A LINK. It would point at the page you are on.
 *
 * THE OTHER ONE IS A REAL LINK, NOT A BUTTON. Changing locale is a full page
 * load — `basename` is fixed when the router mounts — so this is a navigation,
 * and an anchor is what makes it middle-clickable, openable in a new tab, and
 * visible to a crawler following the `hreflang` alternates beside it.
 *
 * `rememberLocale` IS WRITTEN IN THE CLICK HANDLER, AND THE ORDER IS
 * LOAD-BEARING. Switching to French from `/de` lands on `/`, where main.tsx
 * asks `shouldRedirectToGerman()` — which would bounce the visitor straight
 * back to `/de` if the stored preference were still German. localStorage
 * writes synchronously, so the handler completing before the browser navigates
 * is what makes this safe. preference.ts's own docblock carries the warning;
 * this is the call site it was written for.
 *
 * TWO LOCALES, SO A PAIR RATHER THAN A MENU. A third language is when this
 * becomes a menu, and not before.
 */
export function LanguageSwitch({ surface }: { surface: "dark" | "light" }) {
  const current = currentLocale();
  const pill = surface === "dark" ? "bg-white text-stage" : "bg-violet text-white";
  const other =
    surface === "dark" ? "text-white/70 hover:text-white" : "text-ink-muted hover:text-ink";

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
              className={`${pill} rounded px-2 py-1 leading-none font-semibold`}
            >
              {CODE[locale]}
            </span>
            <span className="sr-only">{ENDONYM[locale]}</span>
          </span>
        ) : (
          <a
            key={locale}
            href={switchDestination(locale)}
            // Both of these name the TARGET, which is the point: `hrefLang`
            // tells a crawler what is on the other end, and `lang` stops a
            // screen reader pronouncing it with the page's voice.
            hrefLang={htmlLang(locale)}
            lang={htmlLang(locale)}
            title={ENDONYM[locale]}
            aria-label={t(locale === "de-CH" ? "nav.switchToGerman" : "nav.switchToFrench")}
            onClick={() => rememberLocale(locale)}
            className={`${other} focus-ring inline-flex min-h-touch min-w-touch items-center justify-center rounded`}
          >
            <span className="px-2 py-1 leading-none font-semibold">{CODE[locale]}</span>
          </a>
        ),
      )}
    </div>
  );
}
