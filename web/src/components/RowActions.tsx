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
type RowActionCommon = {
  key: string;
  /** Visible text. Also the item's typeahead value. */
  label: string;
  /** The full accessible name, carrying the row's own name. */
  ariaLabel: string;
  destructive?: boolean;
};

/**
 * A DISCRIMINATED UNION, not "exactly one of these two" left to a comment.
 * The `onSelect` branch may carry `disabled`; the `to` branch forbids both
 * `onSelect` and `disabled` via `?: never`, so a live-disabled-link cannot be
 * constructed at all. It matters because `InlineAction` has no way to honour
 * `disabled` on a link-shaped action — `ButtonLink` has no `aria-disabled`
 * pass-through — so `{ to, disabled: true }` used to render fully live
 * inline while the identical action behind the menu was correctly inert.
 * Nothing constructed that shape, but nothing stopped it either. #118
 * whole-branch review, M6/M7.
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
  /** The row's own name (a person's or an event's), never a full label:
   * the trigger's accessible name is assembled here, from
   * `common.moreActionsAria`, so every call site says WHO this row's
   * actions belong to and nothing about HOW that reaches the screen. */
  rowName: string;
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
              variant="outline"
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
  // `asChild` STRAIGHT TO react-router's `Link`, NOT via `ButtonLink`. A menu
  // item needs no button styling — DropdownMenuItem already carries it, plus
  // the 44px floor — so the extra layer buys nothing and costs everything:
  // ButtonLink destructures a closed prop list and does not spread the rest,
  // so DropdownMenuItem's Slot-merged props (role="menuitem", tabIndex,
  // Radix's pointer/keyboard wiring) land on ButtonLink's own props and are
  // dropped there before they ever reach an element. Verified by watching the
  // test fail exactly that way. `Link` itself spreads its rest props onto the
  // `<a>`, so ONE Slot layer (DropdownMenuItem -> Link) is enough for all of
  // it to land, `aria-label` included. This keeps the four link-shaped
  // actions on /events as real anchors in the menu, not a `useNavigate` call —
  // middle-click and open-in-new-tab on the guest list and the attendance
  // sheet are things committee members actually do.
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
