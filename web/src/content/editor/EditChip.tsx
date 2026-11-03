import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";

import { t } from "../../i18n";

/**
 * The raised yellow "Modifier" chip an editable block wears in edit mode.
 *
 * It sits over the block's top right corner, half outside it, so it takes no
 * room in the block's own layout and moves no line of text: the block must be
 * `relative`. The visible word is the same on every block; the accessible name
 * says which one it opens, so a list of a page's buttons can be told apart.
 */
export function EditChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="raised"
      size="sm"
      aria-label={t("blockEditor.edit", { label })}
      onClick={onClick}
      // min-h-touch from the base keeps the 44px target over size sm's h-8.
      className="absolute -top-3 right-3 z-10 px-3"
    >
      <Pencil aria-hidden="true" />
      {t("common.edit")}
    </Button>
  );
}
