import { cn } from "@/lib/utils";

import { currentLocale, t } from "../../i18n";
import { htmlLang, type Locale } from "../../i18n/locale";
import { Link, useThisPage } from "../../i18n/routing";

const ORDER: Locale[] = ["fr", "de-CH"];
const CODE: Record<Locale, string> = { fr: "FR", "de-CH": "DE" };

/**
 * FR | DE in a block editor's header (#368): the page, which is the editor's
 * preview, in either language, while the edit carries on.
 *
 * Each is a link to this page in its language. Changing language is a
 * navigation inside the app (ADR 0041), so the editor stays open with what was
 * typed, and the discard guard does not ask, since nothing is left.
 *
 * Both stay links, the current one marked and going nowhere, so the one just
 * pressed keeps the focus once the page has changed language. The header's own
 * switch also remembers the choice for the next visit; this one does not: an
 * editor looking at the German page has not chosen to read the site in German.
 */
export function PreviewLanguage() {
  const current = currentLocale();
  const page = useThisPage();

  return (
    <div
      role="group"
      aria-label={t("blockEditor.previewLanguage")}
      className="flex shrink-0 overflow-hidden rounded-lg border-2 border-ink"
    >
      {ORDER.map((locale) => {
        const here = locale === current;
        return (
          <Link
            key={locale}
            to={page}
            locale={locale}
            lang={htmlLang(locale)}
            aria-current={here ? "true" : undefined}
            aria-label={t(
              locale === "fr" ? "blockEditor.previewInFrench" : "blockEditor.previewInGerman",
            )}
            onClick={here ? (event) => event.preventDefault() : undefined}
            className={cn(
              "focus-ring inline-flex min-h-touch min-w-touch items-center justify-center px-2 text-sm leading-none font-bold",
              here ? "bg-ink text-white" : "bg-panel text-ink hover:bg-ink/10",
            )}
          >
            {CODE[locale]}
          </Link>
        );
      })}
    </div>
  );
}
