import { ArrowUpRight, Pencil, type LucideIcon } from "lucide-react";

import { buttonVariants } from "@ds";
import { IconButton } from "@/components/ui/icon-button";
import { Indicator } from "@/components/ui/indicator";
import { cn } from "@/lib/utils";

import { t } from "../../i18n";
import { Link } from "../../i18n/routing";

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
 * The yellow chip of a labelled ChipLink, the same size as IconButton's
 * `grow` chip. h-11 and min-w-11 keep the 44px touch target.
 */
const CHIP = "h-11 min-w-11 px-3";

/** The block's top right corner, inside it. The block must be `relative`. */
const CORNER = "absolute top-2 right-2 z-10";

/**
 * The "Modifier" pencil an editable block wears in edit mode: icon only on a
 * phone, and from `sm` the word rolls up while the pencil is hovered or has
 * keyboard focus, as on a photo slot (IconButton's `grow`).
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
 *
 * `missingGerman` marks a block with a text that has no German, so the
 * German page shows it in French (#359): an {@link Indicator} dot on the
 * chip's top right corner, and "(sans allemand)" after its accessible name,
 * which is where the dot's meaning lives. The visible word stays "Modifier":
 * a longer one pushed a card's arrows out over the next card.
 *
 * The chip is always wrapped, shown or not, so a block's chips sit the same
 * whether they wear the dot, and the corner placing goes on the wrapper.
 */
export function EditChip({
  label,
  text,
  onClick,
  corner = true,
  missingGerman = false,
  id,
}: {
  label: string;
  text?: string;
  onClick: () => void;
  corner?: boolean;
  missingGerman?: boolean;
  /** For a screen that moves focus here itself. */
  id?: string;
}) {
  const name = text ?? t("blockEditor.edit", { label });
  const word = text ?? t("common.edit");
  const marked = (said: string) =>
    missingGerman ? t("blockEditor.missingGerman", { text: said }) : said;
  return (
    // Cyan, picked from rendered variants: violet is the link colour and red
    // the danger one, so either read as something to act on.
    <Indicator
      show={missingGerman}
      color="cyan"
      offset={{ x: -4, y: 4 }}
      className={cn(corner && CORNER)}
    >
      <IconButton
        id={id}
        type="button"
        icon={Pencil}
        label={marked(name)}
        word={word}
        mode="grow"
        variant="accent"
        data-chip="button"
        data-missing-german={missingGerman || undefined}
        onClick={onClick}
      />
    </Indicator>
  );
}

/**
 * A chip that leads somewhere instead of opening an editor, in the same
 * look, such as History's "add" and "edit" chips, whose editors are pages of
 * their own. By default it sits in the block's corner with its label always
 * visible.
 *
 * `corner={false}` leaves the placing to the caller, for a chip in a row of
 * chips. `reveal` gives it the pencil's manners instead: an IconButton chip,
 * the word only on hover or focus from sm up. `iconFirst` keeps the word and
 * puts the icon before it, for an "add" chip, whose plus leads as on every
 * other add control. `ariaLabel` is the fuller accessible name of a chip that repeats
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
  if (reveal) {
    return (
      <IconButton
        asChild
        icon={Icon}
        label={ariaLabel ?? label}
        word={label}
        mode="grow"
        variant="accent"
        className={cn(corner && CORNER)}
      >
        <Link id={id} to={to} data-chip="link" />
      </IconButton>
    );
  }

  const icon = <Icon aria-hidden="true" className="size-5 shrink-0" />;
  return (
    <Link
      id={id}
      to={to}
      aria-label={ariaLabel}
      data-chip="link"
      className={cn(buttonVariants({ variant: "accent" }), CHIP, corner && CORNER)}
    >
      {iconFirst ? (
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
 * An icon-only chip button, named by `label`, whose short `word` rolls up
 * from `sm` on hover or focus. Not positioned: the caller lays it out, for
 * controls such as a card's move arrows.
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
  word,
  icon,
  narrowIcon,
  onClick,
  disabled = false,
  id,
}: {
  label: string;
  word?: string;
  icon: LucideIcon;
  narrowIcon?: LucideIcon;
  onClick: () => void;
  disabled?: boolean;
  /** For a screen that moves focus here itself. */
  id?: string;
}) {
  return (
    <IconButton
      id={id}
      type="button"
      icon={icon}
      narrowIcon={narrowIcon}
      label={label}
      word={word}
      mode="grow"
      variant="accent"
      aria-disabled={disabled || undefined}
      data-chip="button"
      onClick={disabled ? undefined : onClick}
    />
  );
}
