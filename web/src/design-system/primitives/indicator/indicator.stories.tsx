import type { Meta, StoryObj } from "@storybook/react-vite";
import { Pencil } from "lucide-react";
import { expect } from "storybook/test";

import { Indicator } from "./indicator";

/**
 * A stand-in host: a 44px icon button whose name says what the mark means,
 * since the mark itself is hidden from assistive technology.
 */
function Host({ name }: { name: string }) {
  return (
    <button
      type="button"
      aria-label={name}
      className="flex size-touch items-center justify-center rounded-full border-3 border-ink bg-white text-sm font-bold"
    >
      <Pencil aria-hidden="true" className="size-4" />
    </button>
  );
}

const meta = {
  title: "Primitives/Indicator",
  component: Indicator,
  args: { children: <Host name="Modifier le texte, sans allemand" /> },
} satisfies Meta<typeof Indicator>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The default: a cyan dot with an ink ring over the top right corner. */
export const Dot: Story = {};

/** A count, as the account menu shows unread messages. Above `max` it reads "99+". */
export const Count: Story = {
  args: {
    count: 3,
    color: "pink",
    children: <Host name="Mon compte, 3 messages non lus" />,
  },
};

export const CountOverMax: Story = {
  args: { count: 120, color: "danger", ring: "white", children: <Host name="120 messages" /> },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-indicator-mark]")).toHaveTextContent("99+");
  },
};

/** Hidden, or a count of zero: the host keeps its wrapper and does not move. */
export const Hidden: Story = {
  args: { show: false },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-indicator]")).not.toBeNull();
    await expect(canvasElement.querySelector("[data-indicator-mark]")).toBeNull();
  },
};

const COLOURS = ["cyan", "pink", "lime", "yellow", "violet", "danger", "ink"] as const;

/** Every colour. A light fill takes ink figures, a dark one white. */
export const Colours: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      {COLOURS.map((color) => (
        <Indicator key={color} color={color} count={4}>
          <Host name={color} />
        </Indicator>
      ))}
    </div>
  ),
};

/** The three sizes, as a dot and as a count. */
export const Sizes: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      {(["sm", "md", "lg"] as const).map((size) => (
        <Indicator key={`dot-${size}`} size={size}>
          <Host name={`dot ${size}`} />
        </Indicator>
      ))}
      {(["sm", "md", "lg"] as const).map((size) => (
        <Indicator key={`count-${size}`} size={size} count={12} color="pink">
          <Host name={`count ${size}`} />
        </Indicator>
      ))}
    </div>
  ),
};

/** The rings: ink on the page, white on a dark host, or none. */
export const Rings: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      {(["ink", "white", "none"] as const).map((ring) => (
        <Indicator key={ring} ring={ring} color="danger">
          <Host name={`ring ${ring}`} />
        </Indicator>
      ))}
    </div>
  ),
};

/** Each corner, then the same corner nudged by `offset`. */
export const PositionsAndOffset: Story = {
  render: () => (
    <div className="flex flex-wrap gap-6">
      {(["top-right", "top-left", "bottom-right", "bottom-left"] as const).map((position) => (
        <Indicator key={position} position={position}>
          <Host name={position} />
        </Indicator>
      ))}
      <Indicator count={2} color="pink" offset={{ x: -2, y: 4 }}>
        <Host name="offset" />
      </Indicator>
    </div>
  ),
};
