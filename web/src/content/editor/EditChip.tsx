import { ArrowUpRight, Pencil, type LucideIcon } from "lucide-react";
import { Link } from "react-router-dom";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { t } from "../../i18n";

/**
 * Top padding for a block whose first line can run under the chip: a hero's
 * heading, a card's title. The chip is 44px tall and starts 8px inside the
 * block, so it reaches 52px in, and content that starts at 56px clears it.
 * Measured without it, the chip covered "guggen d'enfants" on the home hero at
 * 1280px.
 * edit-blocks.spec.ts checks every chip against its block's text.
 */
export const CHIP_ROOM = "pt-14";

/**
 * The round yellow chip of the photo slot's pencil (SlotPhotoControl), shared
 * by every control a block wears in edit mode. h-11 and min-w-11 keep the 44px
 * touch target.
 */
const CHIP = "group/chip h-11 min-w-11 px-3";

/** The block's top right corner, inside it. The block must be `relative`. */
const CORNER = "absolute top-2 right-2 z-10";

/** The word beside an icon: hidden until hover or keyboard focus from sm up. */
const REVEALED =
  "hidden pr-1 text-sm font-medium sm:group-hover/chip:inline sm:group-focus-visible/chip:inline";

/**
 * The "Modifier" pencil an editable block wears in edit mode: icon only on a
 * phone, and from `sm` the word shows while the pencil is hovered or has
 * keyboard focus, as on a photo slot.
 *
 * It sits inside the block's top right corner. The block must be `relative`,
 * and takes {@link CHIP_ROOM} while the chip shows if its text starts at its
 * top edge: the text then moves down, but its lines break and space as they do
 * for a visitor. The word is the same on every block; the accessible name says
 * which one it opens, so a list of a page's buttons can be told apart.
 *
 * `text`, when given, replaces both: it is the revealed words and the
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
    <button
      type="button"
      aria-label={text ?? t("blockEditor.edit", { label })}
      onClick={onClick}
      className={cn(buttonVariants({ variant: "raised" }), CHIP, CORNER)}
    >
      <Pencil aria-hidden="true" className="size-5 shrink-0" />
      <span className={REVEALED}>{text ?? t("common.edit")}</span>
    </button>
  );
}

/**
 * A chip that leads somewhere instead of opening an editor, in the same
 * corner and look, with its label always visible: it says where a block's
 * content is managed.
 */
export function ChipLink({ label, to }: { label: string; to: string }) {
  return (
    <Link to={to} className={cn(buttonVariants({ variant: "raised" }), CHIP, CORNER)}>
      <span className="text-sm font-medium">{label}</span>
      <ArrowUpRight aria-hidden="true" className="size-5 shrink-0" />
    </Link>
  );
}

/**
 * A round icon-only chip button, named by `label`. Not positioned: the caller
 * lays it out, for controls such as a card's move arrows.
 *
 * `narrowIcon` replaces `icon` below `sm`, for an arrow whose direction
 * follows a layout that stacks on a phone.
 */
export function ChipButton({
  label,
  icon: Icon,
  narrowIcon: NarrowIcon,
  onClick,
  disabled,
}: {
  label: string;
  icon: LucideIcon;
  narrowIcon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(buttonVariants({ variant: "raised" }), CHIP)}
    >
      {NarrowIcon ? (
        <>
          <NarrowIcon aria-hidden="true" className="size-5 shrink-0 sm:hidden" />
          <Icon aria-hidden="true" className="hidden size-5 shrink-0 sm:block" />
        </>
      ) : (
        <Icon aria-hidden="true" className="size-5 shrink-0" />
      )}
    </button>
  );
}
