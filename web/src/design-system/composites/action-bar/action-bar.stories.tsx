import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { expect, userEvent } from "storybook/test";

import { ACTION_STRIP_ROOM, ActionBar, type ActionBarAction, ActionBarList } from "./action-bar";
import { useListMoves } from "./use-list-moves";

const edit = (flag = false): ActionBarAction => ({
  id: "edit",
  icon: Pencil,
  word: "Modifier",
  label: flag ? "Modifier : Notre histoire (sans allemand)" : "Modifier : Notre histoire",
  flag,
  onSelect: () => undefined,
});

const more: ActionBarAction = {
  id: "more",
  label: "Plus d’actions : Notre histoire",
  menu: [
    { id: "duplicate", label: "Dupliquer la carte", icon: Copy, onSelect: () => undefined },
    {
      id: "delete",
      label: "Supprimer la carte",
      icon: Trash2,
      destructive: true,
      onSelect: () => undefined,
    },
  ],
};

const CARD_ACTIONS: ActionBarAction[] = [
  {
    id: "before",
    move: "before",
    word: "Avant",
    label: "Déplacer « Notre histoire » avant",
    onSelect: () => undefined,
  },
  {
    id: "after",
    move: "after",
    word: "Après",
    label: "Déplacer « Notre histoire » après",
    onSelect: () => undefined,
  },
  more,
  edit(),
];

const meta = {
  title: "Composites/ActionBar",
  component: ActionBar,
  args: { look: "strip", label: "Notre histoire", main: "edit", actions: CARD_ACTIONS },
  argTypes: {
    look: { control: "radio", options: ["chip", "strip", "row"] },
    surface: { control: "radio", options: ["page", "stage"] },
  },
  // A strip sits along the top of a 237px card, the narrowest on the home band.
  decorators: [
    (Story, { args }) =>
      args.look === "strip" ? (
        <div
          className={`relative w-[237px] rounded-[20px] border-3 border-ink bg-white px-4 pb-4 shadow-raised ${ACTION_STRIP_ROOM}`}
        >
          <Story />
          <p>Comment la guggen est née en 2002.</p>
        </div>
      ) : (
        <Story />
      ),
  ],
} satisfies Meta<typeof ActionBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** ← → ⋯ ✎ on a card: only the main action shows its word at rest. Hover another to open it. */
export const Strip: Story = {};

/** An end card: its missing arrow keeps its slot, dimmed and aria-disabled. */
export const DimmedSlot: Story = {
  args: {
    actions: CARD_ACTIONS.map((action) =>
      action.id === "before" ? { ...action, disabled: true } : action,
    ),
  },
};

/** A text without German: the corner flag, which the accessible name explains. */
export const Flagged: Story = { args: { actions: [...CARD_ACTIONS.slice(0, 3), edit(true)] } };

/** A history entry, whose order is fixed: ⋯ ✎. */
export const HistoryEntry: Story = { args: { actions: [more, edit()] } };

/** A single block's chip. Below `sm` it shows only the pencil. */
export const Chip: Story = { args: { look: "chip", actions: [edit()] } };

/** On the black stage the chip's shadow turns pink. */
export const ChipOnTheStage: Story = {
  args: { look: "chip", surface: "stage", actions: [edit(true)] },
  globals: { backgrounds: { value: "stage" } },
};

/** A line inside an editor: a quiet row, ↑ ↓ ⋯, folded until hovered or focused. */
export const Row: Story = {
  args: {
    look: "row",
    label: "Téléphone",
    main: undefined,
    actions: [
      {
        id: "before",
        move: "before",
        word: "Monter",
        label: "Monter « Téléphone »",
        disabled: true,
      },
      { id: "after", move: "after", word: "Descendre", label: "Descendre « Téléphone »" },
      { ...more, label: "Plus d’actions : Téléphone" },
    ],
  },
  render: (args) => (
    <ActionBarList stacked>
      <ActionBar {...args} />
    </ActionBarList>
  ),
};

/** Tab lands on the main action; the arrow keys walk the bar and the focused segment inverts. */
export const Keyboard: Story = {
  play: async ({ canvas }) => {
    await userEvent.tab();
    await expect(canvas.getByRole("button", { name: /^Modifier/ })).toHaveFocus();
    await userEvent.keyboard("{Home}");
    await expect(canvas.getByRole("button", { name: /avant$/ })).toHaveAttribute("data-focused");
  },
};

const TITLES = ["Nous rejoindre", "Les canetons", "Notre histoire", "Le comité"];

function Band({ width }: { width: number }) {
  const [order, setOrder] = useState(TITLES);
  const moves = useListMoves({
    keys: order,
    onMove: (key, to) =>
      setOrder((list) => {
        const next = list.filter((title) => title !== key);
        next.splice(to, 0, key);
        return next;
      }),
    announce: (key, position, count) => `${key} : position ${position} sur ${count}`,
  });
  return (
    <ActionBarList>
      <ul className="grid gap-5" style={{ gridTemplateColumns: `repeat(4, ${width}px)` }}>
        {order.map((title) => (
          <li
            key={title}
            ref={moves.itemRef(title)}
            className={`relative rounded-[20px] border-3 border-ink bg-white px-4 pb-4 shadow-raised ${ACTION_STRIP_ROOM}`}
          >
            <ActionBar
              look="strip"
              label={title}
              main="edit"
              actions={[
                moves.moveAction(title, "before", {
                  label: `Déplacer « ${title} » avant`,
                  word: "Avant",
                }),
                moves.moveAction(title, "after", {
                  label: `Déplacer « ${title} » après`,
                  word: "Après",
                }),
                { ...more, label: `Plus d’actions : ${title}` },
                { ...edit(), label: `Modifier : ${title}` },
              ]}
            />
            <p className="font-bold">{title}</p>
          </li>
        ))}
      </ul>
      {moves.liveRegion}
    </ActionBarList>
  );
}

/**
 * The home band at 1024px: four 237px cards. Not every word fits, so every bar keeps only ✎
 * open. The arrows really move the cards.
 */
export const BandAt1024: Story = {
  parameters: { layout: "padded" },
  decorators: [],
  render: () => <Band width={237} />,
};

/** Wider cards where every word fits: nothing folds and nothing needs hover. */
export const BandWhereEveryWordFits: Story = {
  parameters: { layout: "padded" },
  decorators: [],
  render: () => <Band width={340} />,
};
