import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Ellipsis } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { ButtonLink } from "./ButtonLink";

/**
 * One row's actions: the frequent one inline, the rest behind a "..." menu.
 *
 * WHY A MENU AND NOT ICONS. All three candidates measured identically at
 * 390px — one 44px line, the souper's card 388px -> 284px — so the choice was
 * never about space. The menu is the only one that answers the FREQUENCY
 * mismatch instead of compressing it: five identical icon squares give
 * "Qui vient ?", opened weekly, the same weight as "Supprimer", used twice a
 * season. See #118.
 *
 * THE SCREEN DECIDES WHICH ACTIONS EXIST; this decides how they are laid out.
 * It never calls can() — EventCard's docblock explains why that separation is
 * load-bearing, and the same reasoning applies here.
 *
 * THE MENU NEEDS TWO ITEMS TO EXIST. A single item behind a "..." is a tap to
 * reveal a button, which is worse than the button. That is why this counts
 * what would be left rather than trusting a fixed inline slot: three
 * permissions gate the planning's actions independently, so demo.committee —
 * registrations.view and nothing else — reaches the souper with one action
 * and would otherwise get a bare "..." over it.
 */
export type RowAction = {
  key: string;
  /** Visible text. Also the item's typeahead value. */
  label: string;
  /** The full accessible name, carrying the row's own name. */
  ariaLabel: string;
  /** Exactly one of these two. */
  onSelect?: () => void;
  to?: string;
  disabled?: boolean;
  destructive?: boolean;
};

export function RowActions({
  actions,
  inlineKey,
  triggerLabel,
}: {
  actions: RowAction[];
  inlineKey: string;
  triggerLabel: string;
}) {
  if (actions.length === 0) {
    return null;
  }

  // The designated one if the screen passed it, otherwise whatever came
  // first: rules 1 and 2 of the spec's §5.
  const inlineIndex = Math.max(
    0,
    actions.findIndex((a) => a.key === inlineKey),
  );
  const inline = actions[inlineIndex];
  if (!inline) {
    // Cannot happen: inlineIndex is clamped into [0, actions.length) and
    // actions is non-empty above. noUncheckedIndexedAccess still needs this
    // narrowed explicitly — see the same idiom in
    // EventRegistrationOptions.tsx's move().
    return null;
  }
  const rest = actions.filter((_, i) => i !== inlineIndex);

  // Fewer than two items is not a menu. Everything goes inline and no trigger
  // is drawn; the row still fits, because two text buttons were what these
  // screens had before.
  const inMenu = rest.length >= 2 ? rest : [];
  const alsoInline = rest.length >= 2 ? [] : rest;

  return (
    <div className="flex flex-wrap gap-tight">
      {[inline, ...alsoInline].map((a) => (
        <InlineAction key={a.key} action={a} />
      ))}

      {inMenu.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" variant="outline" size="icon" aria-label={triggerLabel}>
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
      <ButtonLink to={action.to} variant="outline" ariaLabel={action.ariaLabel}>
        {action.label}
      </ButtonLink>
    );
  }

  // aria-disabled and an early return, never the disabled attribute: see the
  // docblock in ui/button.tsx.
  return (
    <Button
      type="button"
      variant="outline"
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
  // NOT `asChild` FOR A LINK ITEM, even though InlineAction's single-level
  // ButtonLink works that way. Here the chain is DropdownMenuItem (Slot) ->
  // ButtonLink -> Button (Slot) -> Link, and ButtonLink does not spread
  // arbitrary props through — it destructures a closed prop list. The outer
  // Slot's merged props (role="menuitem", tabIndex, Radix's pointer/keyboard
  // handlers) land on ButtonLink's own props object and are dropped there:
  // the rendered anchor keeps its href but loses role="menuitem" and every
  // Radix behaviour. Verified by watching the test fail this way, not
  // assumed. A plain item that navigates imperatively sidesteps the whole
  // nested-Slot question.
  const navigate = useNavigate();
  const { to } = action;

  // textValue set explicitly rather than left to Radix's fallback (the
  // rendered node's own textContent). Today the two are identical — this
  // item's children are always the plain `label` — so deleting this line
  // changes nothing observable, confirmed by mutation-testing it. It is kept
  // as a safety net: aria-label is NOT part of textContent, so if this
  // item's children ever grow past the plain label, textValue is what keeps
  // typeahead on the short word rather than whatever ends up rendered.
  const common = {
    textValue: action.label,
    disabled: action.disabled,
    destructive: action.destructive,
    "aria-label": action.ariaLabel,
  };

  const item =
    to !== undefined ? (
      <DropdownMenuItem {...common} onSelect={() => navigate(to)}>
        {action.label}
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
