import { ChevronDown, ExternalLink } from "lucide-react";
import {
  type ReactNode,
  startTransition,
  Suspense,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { lazyNamed } from "@/lib/lazy";

import { t } from "../i18n";
import { type NavEntry, EntryLink } from "./NavEntry";
import { DESK_IDLE, DESK_LINK, NAV_HERE } from "./navStyles";

const MoreMenu = lazyNamed(() => import("./MoreMenu"), "MoreMenu");

/** Tailwind's gap-5, which the arithmetic below has to agree with. */
const GAP = 20;

/**
 * The desktop bar: one line at every width, the entries that do not fit
 * folded into "Plus" from the right (#99).
 *
 * `entries` is in order of importance, left to right, so what folds first is
 * what matters least. Layout owns that order.
 *
 * Measured, not breakpointed: the labels change with the language and the
 * list with the member's permissions, so no fixed breakpoint could say how
 * many fit. A hidden copy of every entry plus the "Plus" trigger is measured,
 * and re-measured whenever the bar or the copy changes size (the copy changes
 * when the web font arrives).
 *
 * Where ResizeObserver does not exist (jsdom) every entry stays visible,
 * which is also what a first paint shows before anything is measured.
 */
export function DesktopNav({
  entries,
  active,
  trailing,
}: {
  entries: NavEntry[];
  active: string;
  /** The account control or the login link, pinned to the right. */
  trailing: ReactNode;
}) {
  const [shown, setShown] = useState(entries.length);
  const row = useRef<HTMLDivElement>(null);
  const tail = useRef<HTMLDivElement>(null);
  const ruler = useRef<HTMLUListElement>(null);
  const signature = entries.map((entry) => `${entry.key}:${entry.label}`).join("|");

  useLayoutEffect(() => {
    const measure = () => {
      if (!row.current || !tail.current || !ruler.current) return;
      // Not laid out (display:none below `md`, or jsdom): nothing to fit.
      if (row.current.clientWidth === 0) {
        setShown(entries.length);
        return;
      }
      const cells = Array.from(ruler.current.children) as HTMLElement[];
      const more = cells.pop()?.offsetWidth ?? 0;
      const style = getComputedStyle(row.current);
      const available =
        row.current.clientWidth -
        parseFloat(style.paddingLeft) -
        parseFloat(style.paddingRight) -
        tail.current.offsetWidth -
        GAP;
      setShown(
        fitting(
          cells.map((cell) => cell.offsetWidth),
          more,
          available,
        ),
      );
    };

    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    for (const el of [row.current, ruler.current, tail.current]) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
    // Keyed on what the entries say, not on the array, which Layout builds
    // afresh on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const visible = entries.slice(0, shown);
  const folded = entries.slice(shown);

  return (
    <div
      ref={row}
      className="relative mx-auto hidden max-w-shell items-center gap-5 px-4 py-2 text-sm md:flex"
    >
      <ul className="flex min-w-0 items-center gap-5">
        {visible.map((entry) => (
          <li key={entry.key}>
            <EntryLink
              entry={entry}
              active={entry.to === active}
              compact
              className={`${DESK_LINK} ${DESK_IDLE}`}
              labelClassName={entry.to === active ? NAV_HERE : undefined}
            />
          </li>
        ))}
      </ul>

      {folded.length > 0 ? <More folded={folded} active={active} /> : null}

      <div ref={tail} className="ml-auto flex shrink-0 items-center">
        {trailing}
      </div>

      {/* The ruler: every entry once, then the "Plus" trigger, laid out like
          the real ones and never seen. aria-hidden spans, so it adds nothing
          to the accessibility tree or the tab order. Clipped inside a
          zero-size box because `invisible` still takes up room, and a ruler
          wider than the window would scroll the page sideways. `w-max` keeps
          each entry on one line. Each label is padded as the highlight pads
          it, so the entry that becomes current cannot push the bar onto a
          second line. */}
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden"
      >
        <ul ref={ruler} className="flex w-max gap-5 whitespace-nowrap">
          {entries.map(({ icon: Icon, ...entry }) => (
            <li key={entry.key}>
              <span className={DESK_LINK}>
                {Icon ? <Icon className="size-5" /> : null}
                {Icon && entry.iconOnly ? null : <span className="px-[0.14em]">{entry.label}</span>}
                {entry.href !== undefined && !Icon ? <ExternalLink className="size-4" /> : null}
              </span>
            </li>
          ))}
          <li>
            <span className={DESK_LINK}>
              <span className="px-[0.14em]">{t("nav.more")}</span>
              <ChevronDown className="size-4" />
            </span>
          </li>
        </ul>
      </div>
    </div>
  );
}

/**
 * How many entries fit, left to right: all of them if they fit on their own,
 * otherwise as many as fit beside the "Plus" trigger. Exported for its test.
 */
export function fitting(widths: number[], more: number, available: number): number {
  const total = widths.reduce((sum, w, i) => sum + w + (i > 0 ? GAP : 0), 0);
  if (total <= available) return widths.length;

  let used = more;
  let count = 0;
  for (const w of widths) {
    if (used + GAP + w > available) break;
    used += GAP + w;
    count += 1;
  }
  return count;
}

/** The keys that open a Radix menu from its trigger. */
const OPEN_KEYS = new Set(["Enter", " ", "ArrowDown"]);

/**
 * "Plus": a plain copy of the menu's trigger until the menu's chunk is in
 * (#476). Most visitors never open it, and the menu brings Radix's menu and
 * its positioning with it.
 *
 * The first hover or focus fetches the chunk, which is in long before a click
 * follows. A click or key that comes first anyway is kept: the open state is
 * held here, so the menu opens when it arrives. The fetch runs in a
 * transition, so the copy stays on the page, focus and all, until the real
 * trigger replaces it.
 */
export function More({ folded, active }: { folded: NavEntry[]; active: string }) {
  const [wanted, setWanted] = useState(false);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const foldedActive = folded.some((entry) => entry.to === active);

  const fetchMenu = () => startTransition(() => setWanted(true));
  const openMenu = () => {
    setOpen(true);
    fetchMenu();
  };

  const copy = (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded="false"
      data-state="closed"
      className={`${DESK_LINK} group ${DESK_IDLE}`}
      onPointerEnter={fetchMenu}
      onFocus={() => {
        setFocused(true);
        fetchMenu();
      }}
      onBlur={() => setFocused(false)}
      onPointerDown={(event) => {
        if (event.button === 0) openMenu();
      }}
      onKeyDown={(event) => {
        if (!OPEN_KEYS.has(event.key)) return;
        event.preventDefault();
        openMenu();
      }}
    >
      <span className={foldedActive ? NAV_HERE : undefined}>{t("nav.more")}</span>
      <ChevronDown aria-hidden="true" className="size-4" />
    </button>
  );

  // The boundary is there from the start, with the copy inside it: a
  // transition keeps a mounted boundary's content up while it waits, where a
  // boundary mounted with the menu would show its fallback, a fresh copy.
  return (
    <Suspense fallback={copy}>
      {wanted ? (
        <MoreMenu
          folded={folded}
          active={active}
          open={open}
          onOpenChange={setOpen}
          focus={focused}
        />
      ) : (
        copy
      )}
    </Suspense>
  );
}
