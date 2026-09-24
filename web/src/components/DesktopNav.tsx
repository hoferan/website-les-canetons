import { ChevronDown, ExternalLink } from "lucide-react";
import { type ReactNode, useLayoutEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";

import { t } from "../i18n";
import { type NavEntry, EntryLink } from "./NavEntry";
import { DESK_ACTIVE, DESK_IDLE, DESK_LINK } from "./navStyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";

/** Tailwind's gap-5, which the arithmetic below has to agree with. */
const GAP = 20;

/**
 * The desktop bar: one line at every width, the entries that do not fit
 * folded into "Plus" from the right (#99).
 *
 * `entries` IS IN ORDER OF IMPORTANCE, left to right, so what folds first is
 * what matters least. Layout owns that order.
 *
 * MEASURED, NOT BREAKPOINTED. The labels change with the language and the
 * list changes with the session and the member's permissions, so no fixed
 * breakpoint could say how many fit. A hidden copy of every entry, plus the
 * "Plus" trigger, is measured instead, and re-measured whenever the bar or
 * that copy changes size; the copy's size changes when the web font arrives.
 * The copy measures every label at the active weight, so the item that
 * becomes current cannot push the bar onto a second line.
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
    // Keyed on what the entries SAY rather than on the array, which Layout
    // builds afresh on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const visible = entries.slice(0, shown);
  const folded = entries.slice(shown);
  const foldedActive = folded.some((entry) => entry.to === active);

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
              className={`${DESK_LINK} ${entry.to === active ? DESK_ACTIVE : DESK_IDLE}`}
            />
          </li>
        ))}
      </ul>

      {folded.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger
            className={`${DESK_LINK} group ${foldedActive ? DESK_ACTIVE : DESK_IDLE}`}
          >
            {t("nav.more")}
            <ChevronDown
              aria-hidden="true"
              className="size-4 transition-transform group-data-[state=open]:rotate-180"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {folded.map((entry) => (
              <DropdownMenuItem key={entry.key} asChild>
                {entry.href !== undefined ? (
                  <a href={entry.href} target="_blank" rel="noreferrer">
                    {entry.label}
                    <ExternalLink aria-hidden="true" />
                  </a>
                ) : (
                  <Link to={entry.to} aria-current={entry.to === active ? "page" : undefined}>
                    {entry.label}
                  </Link>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}

      <div ref={tail} className="ml-auto flex shrink-0 items-center">
        {trailing}
      </div>

      {/* THE RULER: every entry once, then the "Plus" trigger, laid out like
          the real ones and never seen. aria-hidden, and spans rather than
          links, so it adds nothing to the accessibility tree or the tab
          order. Clipped inside a zero-size box: `invisible` still takes up
          room, and at 768px the unclipped ruler, wider than the window,
          scrolled the whole page sideways. `w-max` keeps each entry at its
          one-line width inside it. */}
      <div
        aria-hidden="true"
        className="pointer-events-none invisible absolute top-0 left-0 size-0 overflow-hidden"
      >
        <ul ref={ruler} className="flex w-max gap-5 font-semibold whitespace-nowrap">
          {entries.map((entry) => (
            <li key={entry.key}>
              <span className={DESK_LINK}>
                {entry.label}
                {entry.href !== undefined ? <ExternalLink className="size-4" /> : null}
              </span>
            </li>
          ))}
          <li>
            <span className={DESK_LINK}>
              {t("nav.more")}
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
