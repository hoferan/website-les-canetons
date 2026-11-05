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
 *
 * `corner={false}` leaves the placing to the caller, for a pencil at the end
 * of a row of chips: the row grows leftwards as the word shows, so the word
 * pushes the other chips aside instead of covering them.
 */
export function EditChip({
  label,
  text,
  onClick,
  corner = true,
  id,
}: {
  label: string;
  text?: string;
  onClick: () => void;
  corner?: boolean;
  /** For a screen that moves focus here itself. */
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      aria-label={text ?? t("blockEditor.edit", { label })}
      data-chip="button"
      onClick={onClick}
      className={cn(buttonVariants({ variant: "accent" }), CHIP, corner && CORNER)}
    >
      <Pencil aria-hidden="true" className="size-5 shrink-0" />
      <span className={REVEALED}>{text ?? t("common.edit")}</span>
    </button>
  );
}

/**
 * A chip that leads somewhere instead of opening an editor, in the same
 * look. By default it sits in the block's corner with its label always
 * visible: it says where a block's content is managed.
 *
 * `corner={false}` leaves the placing to the caller, for a chip in a row of
 * chips. `reveal` gives it the pencil's manners instead: icon first, the word
 * only on hover or focus from sm up. `iconFirst` keeps the word and puts the
 * icon before it, for an "add" chip, whose plus leads as on every other add
 * control. `ariaLabel` is the fuller accessible name of a chip that repeats
 * once per row, beginning with the visible word.
 */
export function ChipLink({
  label,
  to,
  icon: Icon = ArrowUpRight,
  ariaLabel,
  corner = true,
  reveal = false,
  iconFirst = false,
  id,
}: {
  label: string;
  to: string;
  icon?: LucideIcon;
  ariaLabel?: string;
  corner?: boolean;
  reveal?: boolean;
  iconFirst?: boolean;
  id?: string;
}) {
  const icon = <Icon aria-hidden="true" className="size-5 shrink-0" />;
  return (
    <Link
      id={id}
      to={to}
      aria-label={ariaLabel}
      data-chip="link"
      className={cn(buttonVariants({ variant: "accent" }), CHIP, corner && CORNER)}
    >
      {reveal ? (
        <>
          {icon}
          <span className={REVEALED}>{label}</span>
        </>
      ) : iconFirst ? (
        <>
          {icon}
          <span className="text-sm font-medium">{label}</span>
        </>
      ) : (
        <>
          <span className="text-sm font-medium">{label}</span>
          {icon}
        </>
      )}
    </Link>
  );
}

/**
 * A round icon-only chip button, named by `label`. Not positioned: the caller
 * lays it out, for controls such as a card's move arrows.
 *
 * `narrowIcon` replaces `icon` below `sm`, for an arrow whose direction
 * follows a layout that stacks on a phone.
 *
 * `disabled` marks it with `aria-disabled` and ignores its clicks, rather than
 * disabling it: a disabled button drops the keyboard's focus to the page,
 * and a card's arrows are pressed again and again from the keyboard.
 */
export function ChipButton({
  label,
  icon: Icon,
  narrowIcon: NarrowIcon,
  onClick,
  disabled = false,
  id,
}: {
  label: string;
  icon: LucideIcon;
  narrowIcon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** For a screen that moves focus here itself. */
  id?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      aria-label={label}
      aria-disabled={disabled || undefined}
      data-chip="button"
      onClick={disabled ? undefined : onClick}
      className={cn(buttonVariants({ variant: "accent" }), CHIP)}
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
