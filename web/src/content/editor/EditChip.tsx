import { Pencil } from "lucide-react";

import { Button } from "@/components/ui/button";

import { t } from "../../i18n";

/**
 * Top padding for a block whose first line can run under the chip: a hero's
 * heading, a card's title. The chip is 44px tall and starts 12px above the
 * block, so it reaches 32px in, and content that starts at 40px clears it by
 * 8px. Measured without it, with the shipped texts, the chip covered
 * "guggen d'enfants" on the home hero at 1280px, "Tu veux commencer" on the
 * join hero at 390px, and the top 3px of the card titles.
 * edit-blocks.spec.ts checks every chip against its block's text.
 */
export const CHIP_ROOM = "pt-10";

/**
 * The raised yellow "Modifier" chip an editable block wears in edit mode.
 *
 * It sits on the block's top right corner, partly outside it. The block must
 * be `relative`, and takes {@link CHIP_ROOM} while the chip shows if its text
 * starts at its top edge: the text then moves down, but its lines break and
 * space as they do for a visitor. The visible word is the same on every
 * block; the accessible name says which one it opens, so a list of a page's
 * buttons can be told apart.
 *
 * `text`, when given, replaces both: it is the visible words and the
 * accessible name, for a block whose chip says what it edits in full.
 */
export function EditChip({
  label,
  text,
  onClick,
}: {
  label: string;
  text?: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant="raised"
      size="sm"
      aria-label={text ?? t("blockEditor.edit", { label })}
      onClick={onClick}
      // min-h-touch from the base keeps the 44px target over size sm's h-8.
      className="absolute -top-3 right-3 z-10 px-3"
    >
      <Pencil aria-hidden="true" />
      {text ?? t("common.edit")}
    </Button>
  );
}
