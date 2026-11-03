import { ArrowLeft, ArrowRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

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

/** Which card the editor opens on: one of the grid's, or a new one at its end. */
type Opening = number | "new";

/**
 * A grid of raised cards, each a picture on a carnival colour, a heading and
 * its rows. In edit mode every card carries its own chip, and "Ajouter une
 * carte" sits above the grid, so a list saved empty can still be refilled.
 *
 * The editor shows one card, but saves the whole list: moving a card or
 * deleting it changes its neighbours' places too.
 */
export function CardsBlock({ blockKey }: { blockKey: CardsKey }) {
  const { cards } = useBlock(blockKey);
  const editing = useBlockEditing();
  const [opening, setOpening] = useState<Opening | null>(null);
  const blockLabel = t(BLOCKS[blockKey].label);

  return (
    <>
      {editing ? (
        <Button
          type="button"
          variant="raised"
          size="sm"
          className="mb-related px-3"
          onClick={() => setOpening("new")}
        >
          <Plus aria-hidden="true" />
          {t("blockEditor.addCard")}
        </Button>
      ) : null}

      {cards.length > 0 ? (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((card, index) => (
            <CardView key={card.id} card={card}>
              {editing ? (
                <EditChip
                  label={tr(card.title).trim() || blockLabel}
                  onClick={() => setOpening(index)}
                />
              ) : null}
            </CardView>
          ))}
        </div>
      ) : null}

      {editing ? (
        <BlockEditor blockKey={blockKey} open={opening !== null} onClose={() => setOpening(null)}>
          {() => <CardEditor opening={opening ?? "new"} />}
        </BlockEditor>
      ) : null}
    </>
  );
}

/**
 * One card. The icon is decoration: the heading already says what the card is
 * about.
 */
function CardView({ card, children }: { card: CardData; children: ReactNode }) {
  const Glyph = ICON_GLYPHS[card.icon];

  return (
    <Card className={cn(RAISED_CARD, "relative gap-0 p-5")}>
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
      {card.rows.map((row, index) => (
        <RowView key={index} row={row} />
      ))}
    </Card>
  );
}

function newCard(): CardData {
  return { id: crypto.randomUUID(), icon: "star", tint: "yellow", title: { fr: "" }, rows: [] };
}

/**
 * The fields of the card being edited, inside the block's editor. It follows
 * its card when the card moves. Deleting the card saves the list at once,
 * through the editor's own submit, so its checks and its error line apply.
 */
function CardEditor({ opening }: { opening: Opening }) {
  const { control } = useFormContext<BlockData<CardsKey>>();
  const { fields, append, move, remove } = useFieldArray({ control, name: "cards" });
  const [index, setIndex] = useState(() => (opening === "new" ? fields.length : opening));
  const [confirming, setConfirming] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  // Refs, so StrictMode's second run of an effect neither adds nor saves twice.
  const added = useRef(false);
  const submitted = useRef(false);

  useEffect(() => {
    if (opening !== "new" || added.current) return;
    added.current = true;
    append(newCard(), { shouldFocus: false });
  }, [opening, append]);

  // After the card's fields have left the form, so the browser's checks see
  // only the cards that stay.
  useEffect(() => {
    if (!deleted || submitted.current) return;
    submitted.current = true;
    root.current?.closest("form")?.requestSubmit();
  }, [deleted]);

  const shift = (to: number) => {
    if (to < 0 || to >= fields.length) return;
    move(index, to);
    setIndex(to);
  };

  const shown = !deleted && index < fields.length;

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
              aria-disabled={index === fields.length - 1 || undefined}
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
