import type { Meta, StoryObj } from "@storybook/react-vite";
import { AlertTriangle } from "lucide-react";
import { expect } from "storybook/test";

import { Badge, type BadgeTint } from "./badge";

const meta = {
  title: "Primitives/Badge",
  component: Badge,
  args: { children: "Brouillon" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {};

export const Attention: Story = { args: { tone: "attention", size: "sm", children: "Provisoire" } };

export const Success: Story = { args: { tone: "success", size: "sm", children: "Payé" } };

export const Danger: Story = { args: { tone: "danger", size: "sm", children: "Suspecte" } };

/** The icon is decoration: the word says it, and the icon is hidden from a screen reader. */
export const WithIcon: Story = {
  args: { tone: "attention", icon: <AlertTriangle />, children: "Jamais utilisé" },
};

const TINTS: BadgeTint[] = ["violet", "teal", "amber", "pink", "blue", "green", "coral", "gray"];

/** Every event tag tint. */
export const Tags: Story = {
  render: () => (
    <div className="flex flex-wrap gap-2">
      {TINTS.map((tint) => (
        <Badge key={tint} tone="tag" tint={tint}>
          {tint}
        </Badge>
      ))}
    </div>
  ),
};

/**
 * Both sizes in every tone and every tag tint, with and without an icon. Axe
 * holds each one's text to 4.5:1, the small size included. A size has one
 * height, weight and padding whatever its tone, because every tone keeps a 1px
 * border; the play function measures it.
 */
export const SizesAndTones: Story = {
  render: () => (
    <div className="flex flex-col gap-3">
      {(["sm", "md"] as const).map((size) => (
        <div key={size} data-size={size} className="flex flex-wrap items-start gap-2">
          <Badge size={size}>Public</Badge>
          <Badge size={size} tone="attention">
            Provisorisch
          </Badge>
          <Badge size={size} tone="success">
            Bezahlt
          </Badge>
          <Badge size={size} tone="danger">
            Verdächtig
          </Badge>
          {TINTS.map((tint) => (
            <Badge key={tint} size={size} tone="tag" tint={tint}>
              {tint}
            </Badge>
          ))}
          <Badge size={size} tone="attention" icon={<AlertTriangle />}>
            Jamais utilisé
          </Badge>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [size, height] of [
      ["sm", 22],
      ["md", 26],
    ] as const) {
      const badges = [
        ...canvasElement.querySelectorAll(`[data-size="${size}"] [data-slot="badge"]`),
      ];
      // Four tones, eight tints and the icon example, so a check over nothing fails.
      await expect(badges).toHaveLength(13);
      const looks = new Set(
        badges.map((badge) => {
          const style = getComputedStyle(badge);
          return [
            style.fontSize,
            style.fontWeight,
            style.paddingTop,
            style.paddingLeft,
            style.borderTopWidth,
          ].join(" ");
        }),
      );
      await expect(looks.size).toBe(1);
      for (const badge of badges) {
        await expect(badge.getBoundingClientRect().height).toBe(height);
      }
    }
  },
};
