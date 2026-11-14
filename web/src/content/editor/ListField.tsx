import { Copy, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useFieldArray, useFormContext, type FieldValues } from "react-hook-form";

import {
  ActionBar,
  ActionBarList,
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  useListMoves,
} from "@ds";

import { t } from "../../i18n";

/** The most items a list may hold: the server refuses a longer one. */
export const MAX_ITEMS = 24;

type Choice<T> = { label: string; newItem: () => T };

type Props<T> = {
  /** Where the list sits in the block. */
  name: string;
  addLabel: string;
  /** Fewer items than the server's limit, for a list the page lays out in a fixed space. */
  max?: number;
  /** The fields of the item at `index`. */
  renderItem: (index: number) => ReactNode;
  /** What heads the item at `index`, beside its buttons. */
  itemTitle?: (index: number) => ReactNode;
} & (
  | { newItem: () => T; choices?: never }
  /** A list of several kinds of item: adding asks which. */
  | { choices: readonly Choice<T>[]; newItem?: never }
);

/** The slot of the line's bar that focus returns to after a removal or a copy. */
const MORE = "more";

/**
 * A list inside a block: cards, a card's rows, the site's networks.
 *
 * Each item wears the action bar's `row` look (ADR 0043): ↑ ↓ and a ⋯ that
 * holds Dupliquer and Supprimer. All of it acts on the form only; nothing is
 * stored before Enregistrer. Adding puts the new item at the end. The moves
 * follow `useListMoves`, as on the page: focus stays on the arrow that moved
 * the item and the move is announced. After a removal or a copy focus lands on
 * the ⋯ of the item that took the place, or of the copy, so a keyboard user
 * can keep going without hunting for where they were. Adding stops at the
 * server's limit rather than letting a save be refused.
 */
export function ListField<T extends FieldValues>(props: Props<T>) {
  const { name, addLabel, renderItem, itemTitle, max = MAX_ITEMS } = props;
  const { control, getValues } = useFormContext();
  const { fields, append, insert, move, remove } = useFieldArray({ control, name });
  const list = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<number | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    if (target === null) return;
    focusNext.current = null;
    const button = list.current?.querySelector<HTMLButtonElement>(
      `[data-item="${target}"] [data-action="${MORE}"]`,
    );
    (button ?? addRef.current)?.focus();
  });

  const moves = useMoves(fields, move);

  const drop = (index: number) => {
    // The item that slides into its place, or the one above when it was last;
    // the add button when none is left.
    focusNext.current = Math.min(index, fields.length - 2);
    remove(index);
  };

  // The copy goes right after the original. An item that carries an `id` of its
  // own gets a new one, so nothing keyed by the id (a card's photo) is shared.
  const duplicate = (index: number) => {
    const copy = structuredClone(getValues(`${name}.${index}`)) as Record<string, unknown>;
    if (typeof copy.id === "string") copy.id = crypto.randomUUID();
    focusNext.current = index + 1;
    insert(index + 1, copy as never);
  };

  const add = (item: T) => {
    append(item as never);
  };

  return (
    <div className="flex flex-col gap-3">
      <ActionBarList stacked>
        <ol ref={list} className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <li
              key={field.id}
              ref={moves.itemRef(field.id)}
              data-item={index}
              className="flex flex-col gap-3 rounded-xl border-2 border-ink bg-panel p-3"
            >
              <div className="flex items-center gap-1">
                <div className="mr-auto min-w-0 font-bold">{itemTitle?.(index)}</div>
                <ActionBar
                  look="row"
                  label={t("blockEditor.lineActions")}
                  main={MORE}
                  actions={[
                    moves.moveAction(field.id, "before", {
                      label: t("blockEditor.up"),
                      word: t("blockEditor.up"),
                    }),
                    moves.moveAction(field.id, "after", {
                      label: t("blockEditor.down"),
                      word: t("blockEditor.down"),
                    }),
                    {
                      id: MORE,
                      label: t("blockEditor.lineMore"),
                      menu: [
                        {
                          id: "duplicate",
                          label: t("blockEditor.duplicateLine"),
                          icon: Copy,
                          onSelect: () => duplicate(index),
                        },
                        {
                          id: "remove",
                          label: t("blockEditor.removeLine"),
                          icon: Trash2,
                          destructive: true,
                          onSelect: () => drop(index),
                        },
                      ],
                    },
                  ]}
                />
              </div>
              {renderItem(index)}
            </li>
          ))}
        </ol>
      </ActionBarList>
      {moves.liveRegion}

      {fields.length >= max ? null : props.choices ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button ref={addRef} type="button" variant="secondary" className="self-start">
              <Plus aria-hidden="true" />
              {addLabel}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {props.choices.map((choice) => (
              <DropdownMenuItem key={choice.label} onSelect={() => add(choice.newItem())}>
                {choice.label}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : (
        <Button
          ref={addRef}
          type="button"
          variant="secondary"
          className="self-start"
          onClick={() => add(props.newItem())}
        >
          <Plus aria-hidden="true" />
          {addLabel}
        </Button>
      )}
    </div>
  );
}

/** The move rules of `useListMoves`, over the form's array. */
function useMoves(fields: { id: string }[], move: (from: number, to: number) => void) {
  return useListMoves({
    keys: fields.map((field) => field.id),
    onMove: (id, to) =>
      move(
        fields.findIndex((field) => field.id === id),
        to,
      ),
    announce: (_id, n, count) => t("blockEditor.lineMoved", { n, count }),
  });
}
