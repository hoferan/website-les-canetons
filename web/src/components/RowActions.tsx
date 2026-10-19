import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ellipsis } from "lucide-react";
import { Link } from "react-router-dom";

import { t } from "../i18n";
import { ButtonLink } from "./ButtonLink";

/**
 * One row's actions: the frequent one inline, the rest behind a "..." menu.
 *
 * A menu rather than icons because the actions differ in frequency: identical
 * icon squares would give "Qui vient ?", opened weekly, the same weight as
 * "Supprimer", used twice a season (#118).
 *
 * The screen decides which actions exist; this only lays them out and never
 * calls can(), for the reason given in EventCard's docblock.
 *
 * The menu needs at least two items, since a lone item behind "..." is a tap
 * to reveal a button. Three permissions gate the planning's actions
 * independently, so a caller with registrations.view alone reaches the souper
 * with one action, and this counts what is left instead of assuming a menu.
 */
type RowActionCommon = {
  key: string;
  /** Visible text. Also the item's typeahead value. */
  label: string;
  /** The full accessible name, carrying the row's own name. */
  ariaLabel: string;
  destructive?: boolean;
};

/**
 * A link-shaped action cannot be disabled: `InlineAction` renders it through
 * `ButtonLink`, which has no `aria-disabled` pass-through, so it would stay
 * live inline while the same action in the menu was inert. The `?: never`
 * fields make `{ to, disabled: true }` a type error.
 */
export type RowAction =
  | (RowActionCommon & { onSelect: () => void; to?: never; disabled?: boolean })
  | (RowActionCommon & { to: string; onSelect?: never; disabled?: never });

export function RowActions({
  actions,
  inlineKey,
  rowName,
}: {
  actions: RowAction[];
  inlineKey: string;
  /** The row's own name (a person's or an event's), never a full label: the
   * trigger's accessible name is built here from `common.moreActionsAria`. */
  rowName: string;
}) {
  if (actions.length === 0) {
    return null;
  }

  // The designated one if the screen passed it, otherwise whatever came
  // first.
  const inlineIndex = Math.max(
    0,
    actions.findIndex((a) => a.key === inlineKey),
  );
  const inline = actions[inlineIndex];
  if (!inline) {
    // Unreachable (inlineIndex is clamped and actions is non-empty), but
    // noUncheckedIndexedAccess needs the narrowing.
    return null;
  }
  const rest = actions.filter((_, i) => i !== inlineIndex);

  // With fewer than two left over, everything goes inline and no trigger is
  // drawn.
  const hasMenu = rest.length >= 2;
  const inMenu = hasMenu ? rest : [];
  const alsoInline = hasMenu ? [] : rest;

  return (
    <div className="flex flex-wrap gap-tight">
      {[inline, ...alsoInline].map((a) => (
        <InlineAction key={a.key} action={a} />
      ))}

      {inMenu.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="raised-light"
              size="icon"
              aria-label={t("common.moreActionsAria", { name: rowName })}
            >
              <Ellipsis aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {inMenu.map((a, i) => (
              <ItemFor key={a.key} action={a} first={i === 0} />
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </div>
  );
}

function InlineAction({ action }: { action: RowAction }) {
  if (action.to !== undefined) {
    return (
      <ButtonLink to={action.to} variant="raised-light" ariaLabel={action.ariaLabel}>
        {action.label}
      </ButtonLink>
    );
  }

  // aria-disabled and an early return, never the disabled attribute: see the
  // docblock in ui/button.tsx.
  return (
    <Button
      type="button"
      variant="raised-light"
      aria-label={action.ariaLabel}
      aria-disabled={action.disabled}
      onClick={() => {
        if (action.disabled) return;
        action.onSelect?.();
      }}
    >
      {action.label}
    </Button>
  );
}

function ItemFor({ action, first }: { action: RowAction; first: boolean }) {
  // `asChild` goes straight to react-router's `Link`, never through
  // `ButtonLink`: ButtonLink does not spread unknown props, so the Slot-merged
  // role="menuitem", tabIndex and Radix's pointer and keyboard handlers would
  // be dropped. `Link` spreads them onto the `<a>`. Link-shaped actions stay
  // real anchors so middle-click and open-in-new-tab work.
  const { to } = action;

  // textValue is explicit so typeahead stays on the short label if the
  // children ever grow past it. Today it equals Radix's textContent fallback.
  const common = {
    textValue: action.label,
    disabled: action.disabled,
    destructive: action.destructive,
    "aria-label": action.ariaLabel,
  };

  const item =
    to !== undefined ? (
      <DropdownMenuItem {...common} asChild>
        <Link to={to}>{action.label}</Link>
      </DropdownMenuItem>
    ) : (
      <DropdownMenuItem {...common} onSelect={() => action.onSelect?.()}>
        {action.label}
      </DropdownMenuItem>
    );

  // A separator above the destructive item, unless it is already the first
  // thing in the menu and has nothing to be separated from.
  return action.destructive && !first ? (
    <>
      <DropdownMenuSeparator />
      {item}
    </>
  ) : (
    item
  );
}
