import { useLayoutEffect, useRef, useState } from "react";

import { type Box, type ConfettiKind, type Piece, scatter } from "./scatter";

/**
 * Each shape is a few SVG primitives drawn for this site, centred on 0,0, so
 * there is no licence to track and they stay sharp at any size (ADR 0029).
 * They paint in currentColor, which the caller sets through CSS, because a
 * `var(--color-…)` is reliable there and not in an SVG presentation attribute.
 */
function Shape({ kind }: { kind: ConfettiKind }) {
  switch (kind) {
    case "strip":
      return <rect x={-6} y={-2.5} width={12} height={5} rx={1} fill="currentColor" />;
    case "dot":
      return <circle r={3.5} fill="currentColor" />;
    case "triangle":
      return <path d="M0-5 5 4-5 4z" fill="currentColor" />;
    case "squiggle":
      return (
        <path
          d="M-14 0q3.5-6 7 0t7 0 7 0 7 0"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.6}
          strokeLinecap="round"
        />
      );
    case "star":
      return (
        <path
          d="M0-8 2.2-2.6 8-2.4 3.4 1.2 5 7 0 3.6-5 7-3.4 1.2-8-2.4-2.2-2.6z"
          fill="currentColor"
        />
      );
    case "note":
      return (
        <g fill="currentColor">
          <ellipse cx={-3} cy={6} rx={4.2} ry={3.2} transform="rotate(-20 -3 6)" />
          <rect x={0.2} y={-10} width={1.8} height={16} />
          <path d="M2-10q6 2 6 8-2-4-6-4z" />
        </g>
      );
  }
}

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
}: {
  seed: number;
  colours: string[];
  /** See scatter(). */
  density?: number;
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
        <g
          key={index}
          transform={`translate(${piece.x.toFixed(1)} ${piece.y.toFixed(1)}) rotate(${piece.rotate}) scale(${piece.scale.toFixed(2)})`}
          style={{ color: colours[piece.colour] }}
        >
          <Shape kind={piece.kind} />
        </g>
      ))}
    </svg>
  );
}
