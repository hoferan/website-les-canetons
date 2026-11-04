import { ArrowDown, ArrowLeft, ArrowRight, ArrowUp, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Controller,
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
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { FormError } from "../../components/FormField";
import { RAISED_CARD } from "../../carnival/raised";
import { t } from "../../i18n";
import { cardSlot } from "../../images/photoSlots";
import { SlotPhoto } from "../../images/SlotPhoto";
import { useBlock } from "../BlocksProvider";
import {
  BlockEditor,
  CHIP_ROOM,
  ChipButton,
  EditChip,
  ICON_GLYPHS,
  IconPicker,
  MAX_ITEMS,
  RowFields,
  TINT_BACKGROUNDS,
  TintPicker,
  TranslatedField,
  useSaveBlock,
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
  const full = cards.length >= MAX_ITEMS;
  const fullId = useId();
  // Moving a card saves at once, with no dialog to close.
  const { save, pending, error } = useSaveBlock(blockKey, () => {});
  const shipped = opened
    ? BLOCKS[blockKey].defaults().cards.find((card) => card.id === opened.id)
    : undefined;

  // The arrows are disabled while a save is on its way, so a move never starts
  // from a list that lacks the one before it. Blocks are written without an
  // ETag, so a stale list would silently undo that move instead of failing.
  const shift = (from: number, to: number) => {
    const moved = [...cards];
    moved.splice(to, 0, ...moved.splice(from, 1));
    save({ cards: moved } as CardsData);
  };

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
        <div className="mb-related flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            type="button"
            variant="raised"
            size="sm"
            className="px-3"
            // The server refuses a list longer than MAX_ITEMS. Disabled
            // rather than hidden, so the line beside it says why.
            aria-disabled={full || undefined}
            aria-describedby={full ? fullId : undefined}
            onClick={full ? undefined : () => setOpened({ id: crypto.randomUUID(), adding: true })}
          >
            <Plus aria-hidden="true" />
            {t("blockEditor.addCard")}
          </Button>
          {full ? (
            <p id={fullId} className="text-sm text-ink-muted">
              {t("blockEditor.cardsFull", { max: MAX_ITEMS })}
            </p>
          ) : null}
        </div>
      ) : null}

      {editing ? <FormError error={error} /> : null}

      {cards.length > 0 ? (
        <div className={LAYOUTS[layout]}>
          {cards.map((card, index) => {
            const title = tr(card.title).trim() || blockLabel;
            // Left and right where the grid shows columns (from sm), up and
            // down where it stacks, so the arrow points where the card goes.
            const several = layout === "grid";
            return (
              <CardView
                key={card.id}
                blockKey={blockKey}
                card={card}
                slot={slots[card.id]}
                editing={editing}
              >
                {editing ? (
                  <>
                    {/* Left of the chip, which is 44px wide and 8px inside. */}
                    <div className="absolute top-2 right-[3.75rem] z-10 flex gap-2">
                      {index > 0 ? (
                        <ChipButton
                          label={t("blockEditor.moveCardBefore", { title })}
                          icon={several ? ArrowLeft : ArrowUp}
                          narrowIcon={several ? ArrowUp : undefined}
                          disabled={pending}
                          onClick={() => shift(index, index - 1)}
                        />
                      ) : null}
                      {index < cards.length - 1 ? (
                        <ChipButton
                          label={t("blockEditor.moveCardAfter", { title })}
                          icon={several ? ArrowRight : ArrowDown}
                          narrowIcon={several ? ArrowDown : undefined}
                          disabled={pending}
                          onClick={() => shift(index, index + 1)}
                        />
                      ) : null}
                    </div>
                    <EditChip
                      label={title}
                      onClick={() => setOpened({ id: card.id, adding: false })}
                    />
                  </>
                ) : null}
              </CardView>
            );
          })}
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
  blockKey,
  card,
  slot,
  editing,
  children,
}: {
  blockKey: CardsKey;
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
      {/* The slot shows a placeholder to a visitor while empty, like every
          other slot, and carries its own pencil for an editor. */}
      {card.photo ? (
        <SlotPhoto
          slot={cardSlot(blockKey, card.id)}
          label={tr(card.title).trim() || t(BLOCKS[blockKey].label)}
          alt={tr(card.title)}
        />
      ) : null}
      {slot?.beforeRows}
      {card.rows.map((row, index) => (
        <RowView key={index} row={row} />
      ))}
      {slot?.afterRows}
    </Card>
  );
}

/** Whether the card shows a photo slot under its title. */
function PhotoSwitch({ name }: { name: `cards.${number}.photo` }) {
  const { control } = useFormContext<CardsData>();
  const id = useId();
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <div className="flex min-h-touch items-center justify-between gap-2">
          <label htmlFor={id}>{t("blockEditor.field.photo")}</label>
          <Switch id={id} checked={field.value === true} onCheckedChange={field.onChange} />
        </div>
      )}
    />
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
  const { append, remove } = useFieldArray({ control, name: "cards" });
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
            <PhotoSwitch name={`cards.${index}.photo`} />
            <RowFields name={`cards.${index}.rows`} />
          </div>

          <div className="flex flex-wrap gap-2">
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
