import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  useFieldArray,
  useFormContext,
  type FieldErrors,
  type UseFormReturn,
} from "react-hook-form";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { RAISED_CARD } from "../../carnival/raised";
import { t } from "../../i18n";
import { useBlock } from "../BlocksProvider";
import {
  BlockEditor,
  CHIP_ROOM,
  EditChip,
  ICON_GLYPHS,
  IconPicker,
  RowFields,
  TINT_BACKGROUNDS,
  TintPicker,
  TranslatedField,
} from "../editor";
import { BLOCKS, type BlockData, type BlockKey } from "../registry";
import { tr } from "../translated";
import type { Card as CardData, cardsBlock } from "../types";
import { RowView } from "./RowView";
import { useBlockEditing } from "./useBlockEditing";

/** The blocks that are a grid of cards. */
export type CardsKey = {
  [K in BlockKey]: (typeof BLOCKS)[K]["schema"] extends typeof cardsBlock ? K : never;
}[BlockKey];

type CardsData = BlockData<CardsKey>;

/** Page code shown inside the card with that id, which the band does not edit. */
export type CardSlot = { beforeRows?: ReactNode; afterRows?: ReactNode };

/** The card the editor shows, by id so it stays the same card when it moves. */
type Opened = { id: string; adding: boolean };

const LAYOUTS = {
  grid: "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
  // One card per line at every width, as wide as the page section.
  wide: "grid gap-5",
};

/**
 * A grid of raised cards, each a picture on a carnival colour, a heading and
 * its rows. In edit mode every card carries its own chip, and "Ajouter une
 * carte" sits above the grid, so a list saved empty can still be refilled.
 *
 * The editor shows one card but saves the whole list, since moving or
 * deleting a card changes its neighbours' places. "Rétablir l'original"
 * restores only the card on screen, and only a card the site ships with.
 *
 * `slots` puts page code into a card by its id, before or after its rows: a
 * link to a page, or a line that depends on what the rows hold. A slot for a
 * card the band deleted shows nowhere.
 */
export function CardsBlock({
  blockKey,
  layout = "grid",
  slots = {},
}: {
  blockKey: CardsKey;
  layout?: keyof typeof LAYOUTS;
  slots?: Record<string, CardSlot>;
}) {
  const { cards } = useBlock(blockKey);
  const editing = useBlockEditing();
  const [opened, setOpened] = useState<Opened | null>(null);
  // Remounts the card's fields after a reset, so every field reads it.
  const [resets, setResets] = useState(0);
  const blockLabel = t(BLOCKS[blockKey].label);
  const shipped = opened
    ? BLOCKS[blockKey].defaults().cards.find((card) => card.id === opened.id)
    : undefined;

  const restore = (form: UseFormReturn<CardsData>) => {
    const index = form.getValues("cards").findIndex((card) => card.id === shipped?.id);
    if (!shipped || index === -1) return;
    form.setValue(`cards.${index}`, shipped, { shouldDirty: true });
    setResets((count) => count + 1);
  };

  // A card editor shows one card, so a refused value in another one would
  // otherwise block the save with nothing on screen to say why.
  const elsewhere = (errors: FieldErrors<CardsData>, values: CardsData) => {
    const wrong = values.cards.find(
      (card, index) => card.id !== opened?.id && errors.cards?.[index] !== undefined,
    );
    return wrong
      ? t("blockEditor.otherCardInvalid", { title: tr(wrong.title).trim() || blockLabel })
      : undefined;
  };

  return (
    <>
      {editing ? (
        <Button
          type="button"
          variant="raised"
          size="sm"
          className="mb-related px-3"
          onClick={() => setOpened({ id: crypto.randomUUID(), adding: true })}
        >
          <Plus aria-hidden="true" />
          {t("blockEditor.addCard")}
        </Button>
      ) : null}

      {cards.length > 0 ? (
        <div className={LAYOUTS[layout]}>
          {cards.map((card) => (
            <CardView key={card.id} card={card} slot={slots[card.id]} editing={editing}>
              {editing ? (
                <EditChip
                  label={tr(card.title).trim() || blockLabel}
                  onClick={() => setOpened({ id: card.id, adding: false })}
                />
              ) : null}
            </CardView>
          ))}
        </div>
      ) : null}

      {editing ? (
        <BlockEditor
          blockKey={blockKey}
          open={opened !== null}
          onClose={() => setOpened(null)}
          onReset={shipped ? restore : false}
          invalidMessage={elsewhere}
        >
          {() => (opened ? <CardEditor key={resets} {...opened} /> : null)}
        </BlockEditor>
      ) : null}
    </>
  );
}

/**
 * One card. The icon is decoration: the heading already says what the card is
 * about.
 */
function CardView({
  card,
  slot,
  editing,
  children,
}: {
  card: CardData;
  slot: CardSlot | undefined;
  /** Whether the card wears its chip, and so needs room for it. */
  editing: boolean;
  children: ReactNode;
}) {
  const Glyph = ICON_GLYPHS[card.icon];

  return (
    <Card className={cn(RAISED_CARD, "relative gap-0 p-5", editing && CHIP_ROOM)}>
      {children}
      <div className="flex items-center gap-3">
        <span
          className={cn(
            "grid size-11 shrink-0 place-items-center rounded-xl border-3 border-ink",
            TINT_BACKGROUNDS[card.tint],
          )}
        >
          <Glyph aria-hidden="true" className="size-6" strokeWidth={2.25} />
        </span>
        <h2 className="font-display text-xl">{tr(card.title)}</h2>
      </div>
      {slot?.beforeRows}
      {card.rows.map((row, index) => (
        <RowView key={index} row={row} />
      ))}
      {slot?.afterRows}
    </Card>
  );
}

function newCard(id: string): CardData {
  return { id, icon: "star", tint: "yellow", title: { fr: "" }, rows: [] };
}

/**
 * The fields of the card being edited, inside the block's editor. It finds
 * its card by id, so it follows the card when it moves. Deleting the card
 * saves the list at once, through the editor's own submit, so its checks and
 * its error line apply.
 */
function CardEditor({ id, adding }: Opened) {
  const { control, getValues } = useFormContext<CardsData>();
  const { append, move, remove } = useFieldArray({ control, name: "cards" });
  // Read from the form, which a move changes before the re-render it causes.
  // useWatch would lag one render behind, and the fields left at the old
  // path would write stale defaults into the card that moved there.
  const cards = getValues("cards");
  const index = cards.findIndex((card) => card.id === id);
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // A ref, so StrictMode's second run of the effect does not save twice.
  const submitted = useRef(false);

  useEffect(() => {
    // Checked against the form, so StrictMode's second run adds nothing.
    if (adding && !getValues("cards").some((card) => card.id === id)) {
      append(newCard(id), { shouldFocus: false });
    }
  }, [adding, id, append, getValues]);

  // After the card's fields have left the form, so the browser's checks see
  // only the cards that stay.
  useEffect(() => {
    if (!deleted || submitted.current) return;
    submitted.current = true;
    root.current?.closest("form")?.requestSubmit();
  }, [deleted]);

  const shift = (to: number) => {
    if (to < 0 || to >= cards.length) return;
    move(index, to);
  };

  const shown = !deleted && index !== -1;

  return (
    <div ref={root} className="space-y-4">
      {shown ? (
        <>
          {/* Keyed by place, so every field reads its new path after a move. */}
          <div key={index} className="space-y-4">
            <TranslatedField
              name={`cards.${index}.title`}
              label={t("blockEditor.field.title")}
              required
            />
            <IconPicker name={`cards.${index}.icon`} />
            <TintPicker name={`cards.${index}.tint`} />
            <RowFields name={`cards.${index}.rows`} />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="raised-light"
              size="sm"
              aria-disabled={index === 0 || undefined}
              onClick={() => shift(index - 1)}
            >
              <ArrowLeft aria-hidden="true" />
              {t("blockEditor.moveLeft")}
            </Button>
            <Button
              type="button"
              variant="raised-light"
              size="sm"
              aria-disabled={index === cards.length - 1 || undefined}
              onClick={() => shift(index + 1)}
            >
              <ArrowRight aria-hidden="true" />
              {t("blockEditor.moveRight")}
            </Button>
            <Button
              type="button"
              variant="raised-danger"
              size="sm"
              className="sm:ml-auto"
              onClick={() => setConfirming(true)}
            >
              <Trash2 aria-hidden="true" />
              {t("blockEditor.removeCard")}
            </Button>
          </div>
        </>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("blockEditor.removeCardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("blockEditor.removeCardBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
            <Button
              type="button"
              variant="raised-danger"
              onClick={() => {
                setConfirming(false);
                remove(index);
                setDeleted(true);
              }}
            >
              {t("blockEditor.removeCardConfirm")}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
