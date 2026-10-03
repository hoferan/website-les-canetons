import { Link } from "react-router-dom";

import type { ImageResourceUsagesItem } from "../api/generated/model";

/**
 * The slot's name in its page's words, as the page sent it with the
 * placement, or the bare slot name when it sent none. It is stored in the
 * language the editor was using.
 */
export function usageLabel(usage: ImageResourceUsagesItem): string {
  return usage.label ?? usage.slot;
}

/**
 * Every place a photo is shown, each a link to the page that shows it, where
 * it is also changed. The path is the one the page sent with the placement,
 * without the `/de` prefix, which the router's basename adds on the German
 * side. A placement without a path is listed without a link.
 */
export function UsageLinks({ usages }: { usages: ImageResourceUsagesItem[] }) {
  return (
    <ul className="wrap-anywhere">
      {usages.map((usage) => (
        <li key={usage.slot}>
          {usage.path ? (
            <Link
              to={usage.path}
              className="flex min-h-touch items-center text-violet underline underline-offset-2"
            >
              {usageLabel(usage)}
            </Link>
          ) : (
            <span className="flex min-h-touch items-center">{usageLabel(usage)}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
