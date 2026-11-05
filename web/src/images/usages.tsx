import { ImageMinus } from "lucide-react";
import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

import type { ImageResourceUsagesItem } from "../api/generated/model";
import { t } from "../i18n";
import { isRecordSlot } from "./photoSlots";

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
 *
 * With `onRemove`, a place on a page also gets "Retirer de cet emplacement":
 * a slot whose page no longer draws it (a deleted card, a replaced slot) has
 * no other control, and the library cannot delete a photo still placed. A
 * history entry's or an event's photo is left to that record's editor.
 */
export function UsageLinks({
  usages,
  onRemove,
  busy = false,
}: {
  usages: ImageResourceUsagesItem[];
  onRemove?: (usage: ImageResourceUsagesItem) => void;
  /** While a write runs: the removals wait for it. */
  busy?: boolean;
}) {
  return (
    <ul className="wrap-anywhere">
      {usages.map((usage) => (
        <li key={usage.slot} className="flex flex-wrap items-center gap-x-3">
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
          {onRemove && !isRecordSlot(usage.slot) ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              aria-label={t("photos.detail.removeUsageNamed", { place: usageLabel(usage) })}
              aria-disabled={busy || undefined}
              onClick={busy ? undefined : () => onRemove(usage)}
            >
              <ImageMinus aria-hidden="true" />
              {t("photos.detail.removeUsage")}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
