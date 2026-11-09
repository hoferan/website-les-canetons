import { useRef, type KeyboardEvent, type PointerEvent } from "react";

import { t } from "../../i18n";
import { PANEL_MAX_PX, PANEL_MIN_PX, clampPanel, movePageAside } from "./pageBeside";

/**
 * The docked editor panel's left edge, dragged to make the panel wider or
 * narrower (the page beside it follows), or moved from the keyboard: the
 * arrows step, Home and End go to the narrowest and the widest. Only there
 * from xl, where the panel is docked; the sheet below has no width to change.
 *
 * A window splitter in ARIA's terms: its value is the panel's width.
 *
 * A drag moves the panel (its `--panel-w`) and the page beside it once a
 * frame, straight in the DOM; React sets the width and the browser keeps it
 * only on release. Setting the width as state on every pointer move
 * re-rendered the whole form, and the panel lagged far behind the pointer.
 * The page's reflow itself holds 60 frames a second on an ordinary CPU and
 * still 30 with Chrome's CPU slowed four times.
 */
export function PanelHandle({
  width,
  set,
  step,
}: {
  width: number;
  set: (width: number) => void;
  step: (direction: 1 | -1) => void;
}) {
  const dragging = useRef<{ width: number; frame: number } | null>(null);

  const start = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture?.(event.pointerId);
    dragging.current = { width, frame: 0 };
  };

  const drag = (event: PointerEvent<HTMLDivElement>) => {
    const now = dragging.current;
    if (!now) return;
    // The panel ends at the window's right edge, so its width is what lies
    // right of the pointer.
    now.width = clampPanel(window.innerWidth - event.clientX);
    const panel = event.currentTarget.parentElement;
    cancelAnimationFrame(now.frame);
    now.frame = requestAnimationFrame(() => {
      panel?.style.setProperty("--panel-w", `${now.width}px`);
      movePageAside(now.width);
    });
  };

  const release = () => {
    const now = dragging.current;
    if (!now) return;
    dragging.current = null;
    cancelAnimationFrame(now.frame);
    set(now.width);
  };

  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    const action = {
      ArrowLeft: () => step(1),
      ArrowRight: () => step(-1),
      Home: () => set(PANEL_MIN_PX),
      End: () => set(PANEL_MAX_PX),
    }[event.key];
    if (!action) return;
    event.preventDefault();
    action();
  };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      aria-label={t("blockEditor.panelWidth")}
      aria-valuenow={width}
      aria-valuemin={PANEL_MIN_PX}
      aria-valuemax={PANEL_MAX_PX}
      tabIndex={0}
      onPointerDown={start}
      onPointerMove={drag}
      onPointerUp={release}
      onPointerCancel={release}
      onKeyDown={keys}
      // 12px to grab, centred on the 3px border; the grip shows on hover and focus.
      className="group/handle absolute inset-y-0 -left-1.5 z-20 hidden w-3 cursor-col-resize touch-none outline-none xl:block"
    >
      <span
        aria-hidden="true"
        className="absolute top-1/2 left-1/2 h-12 w-1.5 -translate-1/2 rounded-full bg-ink/30 transition-colors group-hover/handle:bg-ink group-focus-visible/handle:bg-violet"
      />
    </div>
  );
}
