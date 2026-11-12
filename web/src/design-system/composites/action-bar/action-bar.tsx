import * as React from "react";
import { flushSync } from "react-dom";
import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Ellipsis, type LucideIcon } from "lucide-react";

import { cn } from "../../internal/cn";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../primitives/dropdown-menu";

/**
 * The one action bar every edit control wears (ADR 0043).
 *
 * - `chip`: a floating frame for a single block. The caller places it.
 * - `strip`: a list item's top edge, yellow, with a dashed perforation below.
 *   It is absolute along the item's top, so the item must be `relative` and
 *   leave room for it (`ACTION_STRIP_ROOM`).
 * - `row`: a quiet white bar inside an editor, for a line's moves and menu.
 */
export type ActionBarLook = "chip" | "strip" | "row";

export type ActionBarMenuItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Red, and set apart from the items above it by a rule. */
  destructive?: boolean;
};

export type ActionBarAction = {
  /** The slot's key. A screen that moves focus itself finds it as `data-action`. */
  id: string;
  /** The accessible name. It must say everything the icon, the word and a flag say. */
  label: string;
  /** The visible word. A segment without one (the ⋯) never opens. */
  word?: string;
  icon?: LucideIcon;
  /**
   * A move arrow. Its icon follows the list: ← → side by side, ↑ ↓ stacked.
   * `icon` is then ignored.
   */
  move?: "before" | "after";
  /**
   * Called on a click, a tap, Enter or Space. A click from the keyboard has
   * `event.detail === 0`, which is how a caller tells the two apart.
   */
  onSelect?: (event: React.MouseEvent<HTMLButtonElement>) => void;
  /**
   * Dimmed and `aria-disabled`, never removed and never `disabled`: the slot
   * stays where it is on every item, and the keyboard can still reach it.
   */
  disabled?: boolean;
  /**
   * The corner flag: a cyan triangle with an ink diagonal in the segment's top
   * left corner. It means nothing on its own; the label must say it.
   */
  flag?: boolean;
  /** Turns the segment into the trigger of a menu with these items. */
  menu?: ActionBarMenuItem[];
};

export type ActionBarProps = {
  look: ActionBarLook;
  /** The toolbar's accessible name: what the bar acts on. */
  label: string;
  actions: ActionBarAction[];
  /** The id of the action that shows its word at rest and takes the Tab stop. */
  main?: string;
  /** The black stage: a chip's shadow turns pink. */
  surface?: "page" | "stage";
  className?: string;
};

/**
 * Top padding for an item that wears a strip: the strip's 2.875rem plus a
 * gap, so the item's first line clears the perforation.
 */
export const ACTION_STRIP_ROOM = "pt-[calc(2.875rem+1.125rem)]";

type ListState = {
  fitsAll: boolean;
  stacked: boolean;
  measuring: boolean;
  register: (element: HTMLElement) => () => void;
  remeasure: () => void;
};

const ListContext = React.createContext<ListState | null>(null);

/**
 * Wraps a list whose items each wear a bar, and decides for all of them at
 * once, from the widest, whether every word fits. If they do, nothing folds
 * and nothing needs hover. If one does not, every bar keeps only its main
 * action's word and opens another segment on hover or keyboard focus.
 *
 * It measures with the real font, so again once the fonts have loaded, and
 * again whenever a bar changes width or its words change. It also finds out
 * whether the list is stacked (no two bars side by side), which turns the move
 * arrows to ↑ ↓. `stacked` forces that instead.
 *
 * It renders no element of its own.
 */
export function ActionBarList({
  children,
  stacked: forcedStacked,
}: {
  children: React.ReactNode;
  stacked?: boolean;
}) {
  const bars = React.useRef(new Set<HTMLElement>());
  const widths = React.useRef(new WeakMap<HTMLElement, number>());
  const [state, setState] = React.useState({ fitsAll: false, stacked: false, measuring: true });

  const remeasure = React.useCallback(() => {
    setState((current) => (current.measuring ? current : { ...current, measuring: true }));
  }, []);

  const observer = React.useMemo(
    () =>
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver((entries) => {
            const changed = entries.some((entry) => {
              const element = entry.target as HTMLElement;
              const width = element.clientWidth;
              const before = widths.current.get(element);
              widths.current.set(element, width);
              return before !== undefined && before !== width;
            });
            // flushSync: otherwise the measuring frame, every word shown, can paint.
            if (changed) flushSync(remeasure);
          }),
    [remeasure],
  );

  React.useEffect(() => () => observer?.disconnect(), [observer]);

  React.useEffect(() => {
    // A word judged to fit in the fallback font can be cut once the web font
    // is in, which is wider.
    let live = true;
    void document.fonts?.ready.then(() => {
      if (live) remeasure();
    });
    return () => {
      live = false;
    };
  }, [remeasure]);

  const register = React.useCallback(
    (element: HTMLElement) => {
      bars.current.add(element);
      observer?.observe(element);
      remeasure();
      return () => {
        bars.current.delete(element);
        observer?.unobserve(element);
        remeasure();
      };
    },
    [observer, remeasure],
  );

  React.useLayoutEffect(() => {
    if (!state.measuring) return;
    const all = [...bars.current];
    // +1: a subpixel width rounds scrollWidth up.
    const fitsAll = all.every((bar) => bar.scrollWidth <= bar.clientWidth + 1);
    const rects = all.map((bar) => bar.getBoundingClientRect()).sort((a, b) => a.top - b.top);
    // Side by side, two bars overlap vertically, tilted or not.
    const stacked =
      rects.length > 1 &&
      rects.every((rect, n) => n === 0 || rect.top >= (rects[n - 1]?.bottom ?? 0) - 1);
    setState({ fitsAll, stacked, measuring: false });
  }, [state.measuring]);

  const value = React.useMemo<ListState>(
    () => ({
      fitsAll: state.fitsAll,
      stacked: forcedStacked ?? state.stacked,
      measuring: state.measuring,
      register,
      remeasure,
    }),
    [state, forcedStacked, register, remeasure],
  );

  return <ListContext.Provider value={value}>{children}</ListContext.Provider>;
}

/**
 * The flag of ADR 0043. The ink diagonal carries all the contrast (cyan on
 * yellow is 1.08:1), so it must never go.
 */
const FLAG =
  "linear-gradient(135deg, var(--color-mark) 0 calc(50% - 1.5px), var(--color-content) calc(50% - 1.5px) calc(50% + 1.5px), transparent calc(50% + 1.5px))";

const FRAME: Record<ActionBarLook, string> = {
  chip: "inline-flex h-11 rounded-xl border-3 border-ink bg-action-accent",
  // 17px: a list item's 20px radius minus its 3px border, so the strip meets
  // the item's inner edge.
  strip:
    "absolute inset-x-0 top-0 flex h-[2.875rem] rounded-t-[17px] border-b-3 border-dashed border-ink bg-action-accent",
  row: "inline-flex h-10 rounded-[10px] border-2 border-ink bg-white",
};

const DIVIDER: Record<ActionBarLook, string> = {
  chip: "border-l-3 border-solid border-ink",
  strip: "border-l-3 border-solid border-ink",
  row: "border-l-2 border-solid border-ink",
};

/**
 * A closed segment is 2.5rem wide on touch and 2rem under a fine pointer,
 * which only hovers it. Both are above the 24px target minimum.
 */
const CLOSED: Record<ActionBarLook, string> = {
  chip: "flex-[0_0_2.5rem] pointer-fine:flex-[0_0_2rem]",
  strip: "flex-[0_0_2.5rem] pointer-fine:flex-[0_0_2rem]",
  row: "flex-[0_0_2.5rem]",
};

/** On a strip the open segment takes the room that is left; elsewhere its word's. */
const OPEN: Record<ActionBarLook, string> = {
  chip: "flex-none px-3",
  strip: "flex-[1_1_auto] px-2",
  row: "flex-none px-3",
};

const HOVER: Record<ActionBarLook, string> = {
  chip: "hover:bg-action-accent-hover",
  strip: "hover:bg-action-accent-hover",
  row: "hover:bg-ground",
};

/**
 * Whether the last input was a key rather than a pointer, tracked once for the
 * whole document. `:focus-visible` alone is not enough: jsdom never matches it,
 * and the word that opens and the inverted look must agree, so both follow
 * this one answer.
 */
let keyboardLast = false;
let tracking = false;

function trackInputModality() {
  if (tracking || typeof document === "undefined") return;
  tracking = true;
  document.addEventListener(
    "keydown",
    (event) => {
      if (!event.metaKey && !event.ctrlKey && !event.altKey) keyboardLast = true;
    },
    true,
  );
  const pointer = () => {
    keyboardLast = false;
  };
  document.addEventListener("pointerdown", pointer, true);
  document.addEventListener("mousedown", pointer, true);
}

function isFocusVisible(element: Element) {
  if (keyboardLast) return true;
  try {
    return element.matches(":focus-visible");
  } catch {
    return false;
  }
}

function moveIcon(move: "before" | "after", stacked: boolean): LucideIcon {
  if (move === "before") return stacked ? ArrowUp : ArrowLeft;
  return stacked ? ArrowDown : ArrowRight;
}

/**
 * A row of segments in one frame. The main action shows its word at rest; the
 * others show their icon, and their word while hovered with a fine pointer or
 * focused from the keyboard, when the main action folds to its icon. Keyboard
 * focus wins over hover. Inside an {@link ActionBarList} whose words all fit,
 * every segment shows its word and nothing folds.
 *
 * It is a `toolbar` with one Tab stop, the main action's at first, and the
 * arrow keys, Home and End move along it. The focused segment inverts, ink
 * with yellow text, so no focus ring has to escape the clipped frame.
 */
export function ActionBar({
  look,
  label,
  actions,
  main,
  surface = "page",
  className,
}: ActionBarProps) {
  const list = React.useContext(ListContext);
  const frame = React.useRef<HTMLDivElement>(null);
  const buttons = React.useRef(new Map<string, HTMLButtonElement>());
  const [tabStop, setTabStop] = React.useState<string | null>(null);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [focused, setFocused] = React.useState<string | null>(null);

  React.useEffect(trackInputModality, []);

  const register = list?.register;
  React.useLayoutEffect(() => {
    if (!register || !frame.current) return;
    return register(frame.current);
  }, [register]);

  // New words, a language switch say, may no longer fit.
  const words = actions.map((action) => action.word ?? "").join("\u0000");
  const remeasure = list?.remeasure;
  const firstWords = React.useRef(words);
  React.useLayoutEffect(() => {
    if (words === firstWords.current) return;
    firstWords.current = words;
    remeasure?.();
  }, [words, remeasure]);

  const ids = actions.map((action) => action.id);
  const stop = tabStop !== null && ids.includes(tabStop) ? tabStop : (main ?? ids[0]);
  // Only a strip spans its item, so only a strip can run out of room. A chip
  // or a row grows with its words, would always "fit", and stays folded.
  const showAll = look === "strip" && list !== null && (list.measuring || list.fitsAll);
  const openId = focused ?? hovered ?? main ?? null;
  const stacked = list?.stacked ?? false;

  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    // Keys pressed in an open menu bubble here through the portal; they are the menu's.
    const at = ids.findIndex((id) => buttons.current.get(id) === event.target);
    if (at < 0) return;
    const to = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: ids.length - 1 }[event.key];
    if (to === undefined || to < 0 || to >= ids.length) return;
    const next = ids[to];
    if (next === undefined) return;
    event.preventDefault();
    buttons.current.get(next)?.focus();
  }

  return (
    <div
      ref={frame}
      role="toolbar"
      aria-label={label}
      data-action-bar={look}
      onKeyDown={onKeyDown}
      onPointerLeave={() => setHovered(null)}
      className={cn(
        "overflow-hidden",
        FRAME[look],
        look === "chip" && (surface === "stage" ? "shadow-raised-stage" : "shadow-raised-sm"),
        className,
      )}
    >
      {actions.map((action, index) => {
        const worded = action.word !== undefined;
        const open = worded && (showAll || action.id === openId);
        const Icon = action.move ? moveIcon(action.move, stacked) : (action.icon ?? Ellipsis);
        const button = (
          <button
            type="button"
            ref={(element) => {
              if (element) buttons.current.set(action.id, element);
              else buttons.current.delete(action.id);
            }}
            tabIndex={action.id === stop ? 0 : -1}
            aria-label={action.label}
            aria-disabled={action.disabled || undefined}
            data-action={action.id}
            data-move={action.move}
            data-main={action.id === main || undefined}
            data-open={open || undefined}
            data-focused={action.id === focused || undefined}
            onFocus={(event) => {
              setTabStop(action.id);
              setFocused(isFocusVisible(event.currentTarget) ? action.id : null);
            }}
            onBlur={() => setFocused(null)}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse" && worded && !action.disabled) {
                setHovered(action.id);
              }
            }}
            // A move can leave another item's arrow under the pointer; it stays
            // asleep until the pointer has left it (useListMoves).
            onPointerLeave={(event) => event.currentTarget.removeAttribute("data-blocked")}
            onClick={
              action.menu
                ? undefined
                : (event) => {
                    if (action.disabled) return;
                    if (event.currentTarget.hasAttribute("data-blocked")) return;
                    action.onSelect?.(event);
                  }
            }
            className={cn(
              "relative flex h-full min-w-0 cursor-pointer items-center justify-center gap-1.5 text-sm font-extrabold whitespace-nowrap text-content outline-none",
              "transition-[flex-basis,flex-grow,background-color] duration-200",
              index > 0 && DIVIDER[look],
              showAll && worded
                ? "flex-[1_0_auto] px-2"
                : open
                  ? OPEN[look]
                  : cn(CLOSED[look], "px-0"),
              open && action.flag && "justify-start pl-4",
              action.disabled ? "cursor-default" : HOVER[look],
              // Last, so it beats the hover colour: keyboard focus wins.
              "data-[focused]:bg-content data-[focused]:text-action-accent",
            )}
          >
            {action.flag ? (
              <span
                aria-hidden="true"
                data-flag=""
                className={cn(
                  "pointer-events-none absolute top-0 left-0",
                  open ? "size-3.5" : "size-3",
                )}
                style={{ background: FLAG }}
              />
            ) : null}
            <Icon
              aria-hidden="true"
              className={cn("size-5 shrink-0", action.disabled && "opacity-30")}
            />
            {open ? (
              <span
                data-word=""
                // truncate: on an item narrower than any real one, the open word
                // ends in an ellipsis inside the strip.
                className={cn(
                  "truncate",
                  action.disabled && "opacity-30",
                  look === "chip" && "max-sm:hidden",
                )}
              >
                {action.word}
              </span>
            ) : null}
          </button>
        );

        if (!action.menu) return <React.Fragment key={action.id}>{button}</React.Fragment>;

        const items = action.menu;
        return (
          <DropdownMenu key={action.id}>
            <DropdownMenuTrigger asChild>{button}</DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {items.map((item, n) => {
                const Glyph = item.icon;
                return (
                  <React.Fragment key={item.id}>
                    {item.destructive && n > 0 && !items[n - 1]?.destructive ? (
                      <DropdownMenuSeparator />
                    ) : null}
                    <DropdownMenuItem destructive={item.destructive} onSelect={item.onSelect}>
                      {Glyph ? <Glyph aria-hidden="true" /> : null}
                      {item.label}
                    </DropdownMenuItem>
                  </React.Fragment>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        );
      })}
    </div>
  );
}
