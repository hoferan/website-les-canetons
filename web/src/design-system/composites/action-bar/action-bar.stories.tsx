import type { Meta, StoryObj } from "@storybook/react-vite";
import { Copy, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { expect, userEvent, waitFor } from "storybook/test";

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

/** Inside a `data-surface="stage"` element the chip's shadow turns pink, with nothing passed to it. */
export const ChipOnTheStage: Story = {
  args: { look: "chip", actions: [edit(true)] },
  globals: { backgrounds: { value: "stage" } },
  render: (args) => (
    <div data-surface="stage" className="inline-block">
      <ActionBar {...args} />
    </div>
  ),
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

const WORDS = {
  fr: {
    titles: TITLES,
    before: "Avant",
    after: "Après",
    edit: "Modifier",
    beforeLabel: (title: string) => `Déplacer « ${title} » avant`,
    afterLabel: (title: string) => `Déplacer « ${title} » après`,
    moreLabel: (title: string) => `Plus d’actions : ${title}`,
    editLabel: (title: string) => `Modifier : ${title}`,
    moved: (title: string, position: number, count: number) =>
      `${title} : position ${position} sur ${count}`,
  },
  // German words run longer, so more of them fold.
  de: {
    titles: ["Mitmachen", "Die Canetons", "Geschichte", "Der Vorstand"],
    before: "Nach vorn",
    after: "Nach hinten",
    edit: "Bearbeiten",
    beforeLabel: (title: string) => `„${title}“ nach vorn verschieben`,
    afterLabel: (title: string) => `„${title}“ nach hinten verschieben`,
    moreLabel: (title: string) => `Weitere Aktionen: ${title}`,
    editLabel: (title: string) => `Bearbeiten: ${title}`,
    moved: (title: string, position: number, count: number) =>
      `${title}: Position ${position} von ${count}`,
  },
};

function Band({
  width,
  columns = 4,
  count = 4,
  lang = "fr",
}: {
  /** A card's width in px, or 0 for one column that fills the frame. */
  width: number;
  columns?: number;
  count?: number;
  lang?: keyof typeof WORDS;
}) {
  const w = WORDS[lang];
  const [order, setOrder] = useState(() => w.titles.slice(0, count));
  const moves = useListMoves({
    keys: order,
    onMove: (key, to) =>
      setOrder((list) => {
        const next = list.filter((title) => title !== key);
        next.splice(to, 0, key);
        return next;
      }),
    announce: (key, position, of) => w.moved(key, position, of),
  });
  return (
    <ActionBarList>
      <ul
        lang={lang === "fr" ? "fr-CH" : "de-CH"}
        className="grid gap-5"
        style={{ gridTemplateColumns: `repeat(${columns}, ${width ? `${width}px` : "1fr"})` }}
      >
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
                moves.moveAction(title, "before", { label: w.beforeLabel(title), word: w.before }),
                moves.moveAction(title, "after", { label: w.afterLabel(title), word: w.after }),
                { ...more, label: w.moreLabel(title) },
                { ...edit(), word: w.edit, label: w.editLabel(title) },
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

/** The home band at 1024px in German, whose longer words fold where the French ones fit. */
export const BandInGerman: Story = {
  parameters: { layout: "padded" },
  decorators: [],
  render: () => <Band width={237} lang="de" />,
};

/**
 * Two columns of 299px cards, the band at 640px. The arrows still point left
 * and right, because the cards still sit side by side.
 */
export const TwoColumns: Story = {
  parameters: { layout: "padded" },
  decorators: [],
  render: () => <Band width={299} columns={2} />,
};

/**
 * A phone: one column at 390px, inside the page's 16px gutter. The cards
 * stack, so the arrows point up and down; the play function checks it.
 */
export const OneColumnOnAPhone: Story = {
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <div className="w-[390px] bg-yellow px-4 py-9">
        <Story />
      </div>
    ),
  ],
  render: () => <Band width={0} columns={1} count={3} />,
  play: async ({ canvasElement }) => {
    // The list measures itself after layout, so the arrows turn a frame later.
    const first = canvasElement.querySelector("li");
    await waitFor(() => expect(first?.querySelector(".lucide-arrow-up")).not.toBeNull());
    await expect(first?.querySelector(".lucide-arrow-left")).toBeNull();
  },
};
