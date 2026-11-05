import { Link } from "react-router-dom";

import { Notice } from "@/components/Notice";
import { cn } from "@/lib/utils";

import { t, type TranslationKey } from "../../i18n";
import { useSession } from "../../session/SessionProvider";
import { useEditMode } from "../EditMode";

/** One kind of data a page shows but does not own, and where it is managed. */
export type ManagedSource = {
  /** A `blockEditor.managedElsewhere.*` sentence with a `{{page}}` slot. */
  sentence: TranslationKey;
  to: string;
  /** The destination page's name, already in the page's language. */
  page: string;
  /** The permission the destination page needs. */
  permission: string;
};

/**
 * Stands in for the link while the sentence is translated, so the catalogue
 * keeps the whole sentence and its word order.
 */
const SLOT = "\u0000";

/**
 * inline-flex, because the press is a translate, which an inline box
 * ignores; not `inline-block`, which is 32px wide here (docs/traps.md).
 * `relative` positions the line and the patch that press-quiet draws, and
 * `leading-8` gives that line room: it sits 0.85em below the middle, outside
 * a box as tall as the text.
 */
const QUIET_LINK =
  "focus-ring press-quiet relative inline-flex cursor-pointer leading-8 font-medium";

/**
 * The edit-mode notice under a page's hero that says where the data on it is
 * managed: one sentence per source, whose page name links there (#345).
 *
 * One per page, because one source covers many blocks: every register on
 * /band comes from Membres, and a link on each would repeat it six times.
 *
 * A line shows only to someone holding its page's permission: a link that
 * ends on "Accès refusé" reads as a broken site. With no line left, or
 * outside edit mode, it renders nothing.
 */
export function ManagedElsewhere({
  sources,
  className,
}: {
  sources: ManagedSource[];
  className?: string;
}) {
  const { on } = useEditMode();
  const { can } = useSession();
  const shown = on ? sources.filter((source) => can(source.permission)) : [];

  if (shown.length === 0) {
    return null;
  }

  return (
    <Notice className={cn("space-y-tight", className)}>
      {shown.map((source) => {
        const [before, after = ""] = t(source.sentence, { page: SLOT }).split(SLOT);
        return (
          <p key={source.sentence}>
            {before}
            {/* The quiet press of ADR 0040 without the button's base, whose
                44px minimum height would stretch the sentence's line and
                whose text-sm would shrink the page name below the words
                around it. */}
            <Link to={source.to} className={QUIET_LINK}>
              {source.page}
            </Link>
            {after}
          </p>
        );
      })}
    </Notice>
  );
}
