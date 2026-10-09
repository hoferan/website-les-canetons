import { useLayoutEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";

import { ConfettiPiece } from "./ConfettiPiece";
import { type Look, randomPiece } from "./piece";

/** The carnival colours, read from the tokens in styles.css. */
const COLOURS = [
  "var(--color-yellow)",
  "var(--color-pink)",
  "var(--color-cyan)",
  "var(--color-lime)",
  "var(--color-violet)",
];

/** Pieces thrown from each bottom corner. */
const PER_SIDE = 60;

/** Downward pull, and the air's drag on it, in pixels and seconds. */
const GRAVITY = 1800;
const DRAG = 1.6;

/** Positions sampled along each flight; the browser interpolates between them. */
const STEPS = 16;

type Flight = { look: Look; keyframes: Keyframe[]; duration: number; delay: number };

/**
 * One piece's flight from a bottom corner: launched up and inwards, slowed by
 * the air, then falling at about GRAVITY / DRAG. It spins as it goes, and
 * flattens and widens again like a strip of paper turning over.
 *
 * With linear drag the position has a closed form, so the flight is computed
 * once and handed to the browser as keyframes. Nothing runs per frame in
 * JavaScript.
 */
function flight(fromLeft: boolean, width: number, height: number): Flight {
  const random = Math.random;
  const duration = 2.2 + random() * 1.2;
  // Speeds scale with the viewport, so a phone and a desktop both see the
  // confetti reach the upper part of the screen.
  const up = height * (2.3 + random() * 1.3);
  const across = width * (0.5 + random() * 1.4) * (fromLeft ? 1 : -1);
  const x0 = fromLeft ? -10 : width + 10;
  const y0 = height * (0.8 + random() * 0.15);
  const spin = (180 + random() * 540) * (random() < 0.5 ? -1 : 1);
  const flip = 4 + random() * 8;
  const look = randomPiece(random, COLOURS.length);

  const keyframes: Keyframe[] = [];
  for (let step = 0; step <= STEPS; step++) {
    const t = (step / STEPS) * duration;
    const slowed = (1 - Math.exp(-DRAG * t)) / DRAG;
    const x = x0 + across * slowed;
    const y = y0 + (GRAVITY / DRAG) * t + (-up - GRAVITY / DRAG) * slowed;
    keyframes.push({
      transform: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(${(spin * t).toFixed(0)}deg) scaleY(${Math.cos(flip * t).toFixed(2)})`,
      opacity: step / STEPS < 0.8 ? 1 : 1 - (step / STEPS - 0.8) * 5,
    });
  }
  return { look, keyframes, duration: duration * 1000, delay: random() * 150 };
}

function Burst({ onDone }: { onDone: () => void }) {
  const [flights] = useState(() =>
    Array.from({ length: PER_SIDE * 2 }, (_, index) =>
      flight(index % 2 === 0, window.innerWidth, window.innerHeight),
    ),
  );
  const pieces = useRef<(SVGSVGElement | null)[]>([]);

  useLayoutEffect(() => {
    const animations = flights.map((one, index) =>
      pieces.current[index]?.animate(one.keyframes, {
        duration: one.duration,
        delay: one.delay,
        easing: "linear",
        // "both" holds the first frame through the delay; without it a piece
        // waits in the top left corner of the page until it starts.
        fill: "both",
      }),
    );
    void Promise.all(animations.map((animation) => animation?.finished)).then(onDone, onDone);
    return () => animations.forEach((animation) => animation?.cancel());
  }, [flights, onDone]);

  return flights.map((one, index) => (
    <svg
      key={index}
      ref={(element) => {
        pieces.current[index] = element;
      }}
      className="absolute top-0 left-0 overflow-visible"
      width={1}
      height={1}
    >
      <ConfettiPiece piece={one.look} colour={COLOURS[one.look.colour] ?? "currentColor"} />
    </svg>
  ));
}

/**
 * Throws confetti over the whole page, for a moment worth celebrating: a guest
 * has just booked a place, or a member has just said "Oui" to an event whose
 * tag the committee marked for it (#108).
 *
 * The pieces are the same ones the page decoration is drawn with
 * (ConfettiPiece), so nothing here has a licence to track. It mounts its own
 * overlay, out of the pointer's way and hidden from screen readers, and takes
 * it away once the last piece has landed.
 *
 * Throws nothing for somebody who asked for less motion, as ADR 0029 requires
 * of anything that moves, nor in a browser without the Web Animations API.
 * Call it from the event that earned it, not from an effect: React's
 * StrictMode runs effects twice in development, which would throw twice.
 */
export function celebrate(): void {
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) return;
  if (typeof Element.prototype.animate !== "function") return;

  const host = document.createElement("div");
  host.dataset.testid = "celebration";
  host.setAttribute("aria-hidden", "true");
  host.className = "pointer-events-none fixed inset-0 z-50 overflow-hidden";
  document.body.append(host);

  const root = createRoot(host);
  root.render(
    <Burst
      onDone={() => {
        root.unmount();
        host.remove();
      }}
    />,
  );
}
