import type { KeyboardEvent, PointerEvent } from "react";

import { t } from "../../i18n";
import { PANEL_MAX_PX, PANEL_MIN_PX } from "./pageBeside";

/**
 * The docked editor panel's left edge, dragged to make the panel wider or
 * narrower (the page beside it follows), or moved from the keyboard: the
 * arrows step, Home and End go to the narrowest and the widest. Only there
 * from xl, where the panel is docked; the sheet below has no width to change.
 *
 * A window splitter in ARIA's terms: its value is the panel's width.
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
  const drag = (event: PointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return;
    // The panel ends at the window's right edge, so its width is what lies
    // right of the pointer.
    set(window.innerWidth - event.clientX);
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
      onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
      onPointerMove={drag}
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
