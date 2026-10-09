import type { ConfettiKind, Look } from "./piece";

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

/**
 * One confetto, as an SVG group, for inside an `<svg>`: the scattered
 * decoration draws many into one, and a throw puts each in its own.
 *
 * `wobble` rocks it gently in place. The timing comes from the piece itself,
 * so neighbours do not swing in step and a page wobbles the same way on every
 * visit. It never moves the piece off its spot, which is what keeps it clear
 * of the text the scatter placed it away from. Under reduced motion there is
 * no animation at all: `motion-safe:` leaves the class out, where the global
 * reduced-motion rule would only shorten an endless animation into a flicker.
 */
export function ConfettiPiece({
  piece,
  x = 0,
  y = 0,
  colour,
  wobble = false,
}: {
  piece: Look;
  x?: number;
  y?: number;
  colour: string;
  wobble?: boolean;
}) {
  const shape = <Shape kind={piece.kind} />;
  return (
    <g
      transform={`translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${piece.rotate}) scale(${piece.scale.toFixed(2)})`}
      style={{ color: colour }}
    >
      {wobble ? (
        <g
          className="motion-safe:animate-wobble"
          style={{
            animationDuration: `${4 + (piece.rotate % 30) / 10}s`,
            animationDelay: `-${(piece.rotate % 7).toFixed(1)}s`,
          }}
        >
          {shape}
        </g>
      ) : (
        shape
      )}
    </g>
  );
}
