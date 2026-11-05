import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { useFieldArray, useFormContext, type FieldValues } from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

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

type Action = "up" | "down" | "remove";

/**
 * A list inside a block: cards, a card's rows, the site's networks.
 *
 * Each item carries its own up, down and remove buttons, and adding puts the
 * new item at the end. Focus follows the item a button moved, and after a
 * removal lands on the item that took its place, so a keyboard user can keep
 * going without hunting for where they were. Adding stops at the server's
 * limit rather than letting a save be refused.
 */
export function ListField<T extends FieldValues>(props: Props<T>) {
  const { name, addLabel, renderItem, itemTitle, max = MAX_ITEMS } = props;
  const { control } = useFormContext();
  const { fields, append, move, remove } = useFieldArray({ control, name });
  const list = useRef<HTMLOListElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<{ index: number; action: Action } | null>(null);

  useEffect(() => {
    const target = focusNext.current;
    if (!target) return;
    focusNext.current = null;
    const button = list.current?.querySelector<HTMLButtonElement>(
      `[data-item="${target.index}"] [data-action="${target.action}"]`,
    );
    (button ?? addRef.current)?.focus();
  });

  const shift = (from: number, to: number, action: Action) => {
    if (to < 0 || to >= fields.length) return;
    focusNext.current = { index: to, action };
    move(from, to);
  };

  const drop = (index: number) => {
    // The item that slides into its place, or the one above when it was last;
    // the add button when none is left.
    focusNext.current = { index: Math.min(index, fields.length - 2), action: "remove" };
    remove(index);
  };

  const add = (item: T) => {
    append(item as never);
  };

  return (
    <div className="flex flex-col gap-3">
      <ol ref={list} className="flex flex-col gap-3">
        {fields.map((field, index) => (
          <li
            key={field.id}
            data-item={index}
            className="flex flex-col gap-3 rounded-xl border-2 border-ink bg-panel p-3"
          >
            <div className="flex items-center gap-1">
              <div className="mr-auto min-w-0 font-bold">{itemTitle?.(index)}</div>
              <ItemButton
                action="up"
                label={t("blockEditor.up")}
                disabled={index === 0}
                onClick={() => shift(index, index - 1, "up")}
              >
                <ArrowUp aria-hidden="true" />
              </ItemButton>
              <ItemButton
                action="down"
                label={t("blockEditor.down")}
                disabled={index === fields.length - 1}
                onClick={() => shift(index, index + 1, "down")}
              >
                <ArrowDown aria-hidden="true" />
              </ItemButton>
              <ItemButton
                action="remove"
                label={t("blockEditor.remove")}
                onClick={() => drop(index)}
              >
                <Trash2 aria-hidden="true" />
              </ItemButton>
            </div>
            {renderItem(index)}
          </li>
        ))}
      </ol>

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

/**
 * An icon-only item button (ADR 0025), its name the action alone: the list
 * item around it says which item it acts on. At an end of the list it stays
 * focusable and says it cannot move, rather than vanishing under the focus.
 */
function ItemButton({
  action,
  label,
  disabled = false,
  onClick,
  children,
}: {
  action: Action;
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="quiet"
      size="icon"
      data-action={action}
      aria-label={label}
      aria-disabled={disabled || undefined}
      onClick={disabled ? undefined : onClick}
    >
      {children}
    </Button>
  );
}
