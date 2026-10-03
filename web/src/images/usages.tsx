import { Link } from "react-router-dom";

import type { ImageResourceUsagesItem } from "../api/generated/model";
import { t } from "../i18n";

export function usageLabel(usage: ImageResourceUsagesItem): string {
  return t(`photos.usage.${usage.kind}`, { label: usage.label ?? "" });
}

/**
 * The page that shows the photo, where it is also changed. A plain path: the
 * router's basename adds `/de` on the German side.
 *
 * A register goes to /band without its anchor. ScrollToTop leaves a URL with a
 * hash alone, so `/band#register-5` would open /band at the scroll offset
 * /media had, which lands somewhere arbitrary on the page.
 */
export function usagePath(usage: ImageResourceUsagesItem): string {
  switch (usage.kind) {
    case "band":
    case "register":
      return "/band";
    case "concert":
      return "/";
    case "history":
      return "/history";
  }
}

/** Every place a photo is shown, each a link to its page. A library card and the photo's own page both list them. */
export function UsageLinks({ usages }: { usages: ImageResourceUsagesItem[] }) {
  return (
    <ul className="wrap-anywhere">
      {usages.map((usage) => (
        <li key={`${usage.kind}-${usage.id ?? ""}`}>
          <Link
            to={usagePath(usage)}
            className="flex min-h-touch items-center text-violet underline underline-offset-2"
          >
            {usageLabel(usage)}
          </Link>
        </li>
      ))}
    </ul>
  );
}
