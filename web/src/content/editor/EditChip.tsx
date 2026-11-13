import { Pencil, type LucideIcon } from "lucide-react";

import { ActionBar } from "@ds";

import { t } from "../../i18n";

/** The block's top right corner, inside it. The block must be `relative`. */
const CORNER = "absolute top-2 right-2 z-10";

/**
 * The pencil an editable block wears in edit mode: the action bar's `chip`
 * with one action (ADR 0043). Its word shows at rest from `sm`, as every
 * bar's main action does, and only the icon on a phone.
 *
 * By default it sits inside the block's top right corner. The block must be
 * `relative`, and leave room above any text that starts at its top edge
 * (`pt-14`: the chip is 44px tall and starts 8px in). `className` replaces
 * that placing, for the footer's chip below the scallops or a photo's in its
 * bottom corner. edit-blocks.spec.ts checks every chip against its block's
 * text.
 *
 * `label` names the block. The accessible name says which block the pencil
 * opens, so a list of a page's buttons can be told apart; the word is the
 * same on every block. `text`, when given, replaces both: it is the word and
 * the accessible name, for a block whose chip says what it edits in full.
 *
 * `missingGerman` marks a block with a text that has no German, so the
 * German page shows it in French (#359): the corner flag, and "(sans
 * allemand)" after the accessible name, which is where the flag's meaning
 * lives.
 *
 * `disabled` marks it `aria-disabled` and ignores its clicks, for a photo
 * slot that is saving.
 */
export function EditChip({
  label,
  text,
  word,
  icon = Pencil,
  onClick,
  missingGerman = false,
  disabled = false,
  surface = "page",
  className = CORNER,
}: {
  label: string;
  text?: string;
  /** The visible word when it differs from the block's "Modifier", with a name of its own in `text`. */
  word?: string;
  icon?: LucideIcon;
  onClick: () => void;
  missingGerman?: boolean;
  disabled?: boolean;
  /** The black stage: the shadow turns pink. */
  surface?: "page" | "stage";
  className?: string;
}) {
  const name = text ?? t("blockEditor.edit", { label });
  return (
    <ActionBar
      look="chip"
      label={label}
      main="edit"
      surface={surface}
      className={className}
      actions={[
        {
          id: "edit",
          icon,
          word: word ?? text ?? t("common.edit"),
          label: missingGerman ? t("blockEditor.missingGerman", { text: name }) : name,
          flag: missingGerman,
          disabled,
          onSelect: onClick,
        },
      ]}
    />
  );
}
