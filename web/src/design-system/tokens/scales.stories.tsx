import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";

/**
 * The type, radius and shadow scales from tokens.css (#398). Every size on
 * the site is one of these steps; tools/design-scales.test.mjs and
 * web/e2e/scales.spec.ts fail on any other.
 *
 * Each sample's play function reads back the computed value, so a step
 * changed in tokens.css shows up here as well as on the page.
 */
const meta = {
  title: "Foundations/Scales",
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

// Class names are written out whole so Tailwind finds them.
const TYPE = [
  { name: "text-xs", className: "text-xs", px: 12 },
  { name: "text-sm", className: "text-sm", px: 14 },
  { name: "text-base", className: "text-base", px: 16 },
  { name: "text-lg", className: "text-lg", px: 18 },
  { name: "text-xl", className: "text-xl", px: 20 },
  { name: "text-2xl", className: "text-2xl", px: 24 },
  { name: "text-3xl", className: "text-3xl", px: 30 },
  { name: "text-4xl", className: "text-4xl", px: 36 },
  { name: "text-5xl", className: "text-5xl", px: 48 },
  { name: "text-8xl (hero)", className: "text-8xl", px: 96 },
  { name: "text-9xl (hero)", className: "text-9xl", px: 128 },
];

const RADIUS = [
  { name: "rounded-sm · control", className: "rounded-sm", px: "6px" },
  { name: "rounded-md · button", className: "rounded-md", px: "12px" },
  { name: "rounded-lg · surface", className: "rounded-lg", px: "18px" },
  { name: "rounded-full · pill", className: "rounded-full", px: "3.35544e+07px" },
];

const SHADOW = [
  { name: "shadow-raised", className: "shadow-raised" },
  { name: "shadow-raised-sm", className: "shadow-raised-sm" },
  { name: "shadow-raised-pressed", className: "shadow-raised-pressed" },
  { name: "shadow-overlay", className: "shadow-overlay" },
];

export const Type: Story = {
  render: () => (
    <ul className="flex flex-col gap-3 text-content">
      {TYPE.map(({ name, className, px }) => (
        <li key={name} className="flex items-baseline gap-4">
          <span className="w-36 shrink-0 font-mono text-xs text-content-muted">
            {name} · {px}px
          </span>
          <span data-step={px} className={`${className} leading-none whitespace-nowrap`}>
            Canetons
          </span>
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    for (const sample of canvasElement.querySelectorAll<HTMLElement>("[data-step]")) {
      await expect(getComputedStyle(sample).fontSize).toBe(`${sample.dataset.step}px`);
    }
  },
};

export const Radius: Story = {
  render: () => (
    <ul className="flex flex-wrap gap-6 text-content">
      {RADIUS.map(({ name, className, px }) => (
        <li key={name} className="flex flex-col items-center gap-2">
          <span
            data-step={px}
            role="img"
            aria-label={name}
            className={`${className} block size-20 border-3 border-ink bg-yellow`}
          />
          <span className="font-mono text-xs text-content-muted">{name}</span>
        </li>
      ))}
    </ul>
  ),
  play: async ({ canvasElement }) => {
    for (const sample of within(canvasElement).getAllByRole("img")) {
      await expect(getComputedStyle(sample).borderTopLeftRadius).toBe(sample.dataset.step);
    }
  },
};

export const Shadow: Story = {
  render: () => (
    <ul className="flex flex-wrap gap-8 bg-ground p-6 text-content">
      {SHADOW.map(({ name, className }) => (
        <li key={name} className="flex flex-col items-center gap-3">
          <span className={`${className} block size-20 rounded-md border-3 border-ink bg-panel`} />
          <span className="font-mono text-xs text-content-muted">{name}</span>
        </li>
      ))}
    </ul>
  ),
};

/** On the stage, the raised shadows turn pink and the small one grows to 4px. */
export const ShadowOnStage: Story = {
  render: () => (
    <ul data-surface="stage" className="flex flex-wrap gap-8 bg-stage p-6 text-white">
      {SHADOW.slice(0, 3).map(({ name, className }) => (
        <li key={name} className="flex flex-col items-center gap-3">
          <span className={`${className} block size-20 rounded-md border-3 border-ink bg-panel`} />
          <span className="font-mono text-xs text-white/70">{name}</span>
        </li>
      ))}
    </ul>
  ),
};
