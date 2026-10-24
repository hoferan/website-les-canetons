import { Plus } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { OptionKind } from "../../api/generated/model";
import { RAISED_CARD } from "../../carnival/raised";
import { t } from "../../i18n";
import { KINDS } from "./drafts";
import { KindTile } from "./kinds";

/**
 * A "+" that opens the six kinds in place and inserts the one picked.
 *
 * Between two blocks it is a small round button named for where it inserts;
 * at the end of the form it is the wide dashed one the mock-ups show.
 */
export function BlockInserter({
  label,
  wide = false,
  onPick,
}: {
  /** The button's accessible name, which says where the block goes. */
  label: string;
  wide?: boolean;
  onPick: (kind: OptionKind) => void;
}) {
  const [picking, setPicking] = useState(false);

  if (picking) {
    return (
      <div className={cn(RAISED_CARD, "flex flex-col gap-related border-violet p-4")}>
        <p className="font-semibold">{t("registrationOptions.pickerHeading")}</p>
        <div className="grid gap-tight sm:grid-cols-2">
          {KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className="flex min-h-touch items-start gap-2 rounded-xl border-2 border-ink bg-panel p-3 text-left hover:bg-ground focus-visible:outline-3 focus-visible:outline-violet"
              onClick={() => {
                setPicking(false);
                onPick(kind);
              }}
            >
              <KindTile kind={kind} />
              <span className="flex flex-col">
                <span className="font-semibold">{t(`registrationOptions.kinds.${kind}`)}</span>
                <span className="text-sm text-ink-muted">
                  {t(`registrationOptions.kindHints.${kind}`)}
                </span>
              </span>
            </button>
          ))}
        </div>
        <Button
          type="button"
          variant="raised-light"
          className="w-fit"
          onClick={() => setPicking(false)}
        >
          {t("registrationOptions.cancel")}
        </Button>
      </div>
    );
  }

  if (wide) {
    return (
      <button
        type="button"
        onClick={() => setPicking(true)}
        className="flex min-h-touch w-full items-center justify-center gap-2 rounded-[18px] border-2 border-dashed border-ink-muted text-ink-muted hover:border-ink hover:text-ink focus-visible:outline-3 focus-visible:outline-violet"
      >
        <Plus aria-hidden="true" className="size-4" />
        {label}
      </button>
    );
  }

  return (
    <div className="flex justify-center">
      <Button
        type="button"
        variant="raised-light"
        size="icon"
        className="rounded-full"
        aria-label={label}
        onClick={() => setPicking(true)}
      >
        <Plus aria-hidden="true" />
      </Button>
    </div>
  );
}
