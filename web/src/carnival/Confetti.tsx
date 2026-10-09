import { useLayoutEffect, useRef, useState } from "react";

import { ConfettiPiece } from "./ConfettiPiece";
import { type Box, type Piece, scatter } from "./scatter";

function boxOf(element: Element, origin: DOMRect): Box {
  const rect = element.getBoundingClientRect();
  return {
    left: rect.left - origin.left,
    top: rect.top - origin.top,
    right: rect.right - origin.left,
    bottom: rect.bottom - origin.top,
  };
}

/**
 * Confetti scattered over its parent, kept off every descendant of that parent
 * marked `data-confetti-avoid`.
 *
 * Only for coloured surfaces (a hero, a coloured band, the phone menu), and
 * never on the cream a visitor reads from: that is the ADR's rule, and nothing
 * here can enforce it, so the caller does.
 *
 * The parent must be `relative` and clip its overflow. The layout is measured,
 * so it is recomputed when the parent resizes; until the first measurement,
 * and in a test environment without layout, it draws nothing.
 */
export function Confetti({
  seed,
  colours,
  density,
  wobble = false,
}: {
  seed: number;
  colours: string[];
  /** See scatter(). */
  density?: number;
  /** Rocks each piece gently in place; see ConfettiPiece. */
  wobble?: boolean;
}) {
  const svg = useRef<SVGSVGElement>(null);
  const [layout, setLayout] = useState<{ width: number; height: number; pieces: Piece[] }>({
    width: 0,
    height: 0,
    pieces: [],
  });

  useLayoutEffect(() => {
    const parent = svg.current?.parentElement;
    if (!parent) {
      return;
    }

    const measure = () => {
      const origin = parent.getBoundingClientRect();
      const avoid = [...parent.querySelectorAll("[data-confetti-avoid]")].map((element) =>
        boxOf(element, origin),
      );
      setLayout({
        width: origin.width,
        height: origin.height,
        pieces: scatter({
          width: origin.width,
          height: origin.height,
          seed,
          avoid,
          palette: colours.length,
          density,
        }),
      });
    };

    measure();
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const observer = new ResizeObserver(measure);
    observer.observe(parent);
    // Fonts arrive after the first layout and change how tall a heading is.
    void document.fonts?.ready.then(measure);
    return () => observer.disconnect();
  }, [seed, colours.length, density]);

  return (
    <svg
      ref={svg}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox={`0 0 ${Math.round(layout.width) || 1} ${Math.round(layout.height) || 1}`}
      preserveAspectRatio="none"
    >
      {layout.pieces.map((piece, index) => (
        <ConfettiPiece
          key={index}
          piece={piece}
          x={piece.x}
          y={piece.y}
          colour={colours[piece.colour] ?? "currentColor"}
          wobble={wobble}
        />
      ))}
    </svg>
  );
}
