import { useLayoutEffect } from "react";

import { t } from "../i18n";

/**
 * Sets the document's title for the page that calls it (#389).
 *
 * Each page names itself, with the catalogue key its h1 uses, or the thing it
 * shows once that has loaded. Without a name it is the home page, which gets
 * the band's full name alone.
 *
 * Computed at render, so the title follows a change of language: the route
 * table renders every page again in the new one. Back restores the previous
 * title because the previous page mounts again and sets its own.
 *
 * A layout effect, so the title is right before the browser paints and
 * before RouteFocus moves focus to the heading.
 */
export function usePageTitle(page?: string): void {
  const title = page === undefined ? t("meta.title") : t("meta.pageTitle", { page });

  useLayoutEffect(() => {
    document.title = title;
  }, [title]);
}
