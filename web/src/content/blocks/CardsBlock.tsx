import { Copy, Pencil, Plus, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from "react";

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ACTION_STRIP_ROOM,
  ActionBar,
  type ActionBarAction,
  type ActionBarMenuItem,
  ActionBarList,
  Button,
  type ListMoves,
  useListMoves,
} from "@ds";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

import { FormError } from "../../components/FormField";
import { RAISED_CARD } from "../../carnival/raised";
import { onDemand } from "../../lib/lazy";
import { t } from "../../i18n";
import { Link } from "../../i18n/routing";
import { cardSlot } from "../../images/photoSlots";
import { SlotPhoto } from "../../images/SlotPhoto";
import { useBlock } from "../BlocksProvider";
import { isPublicPage } from "../publicPages";
import { useSaveBlock } from "../editor/useSaveBlock";
import { ICON_GLYPHS, TINT_BACKGROUNDS } from "../cardLook";
import { BLOCKS } from "../registry";
import { lacksGerman, tr } from "../translated";
import { isActionTarget, MAX_ITEMS, type Card as CardData } from "../types";
import { RowView } from "./RowView";
import { useBlockEditing } from "./useBlockEditing";
import { cardEditTarget, type CardsData, type CardsKey, type Opened } from "./cards";

export type { CardsKey };

/** Only for an editor in edit mode, so it is not in a visitor's bundle (#396). */
const CardsEditor = onDemand(() => import("./CardsEditor"), "CardsEditor");

/** Page code shown inside the card with that id, which the band does not edit. */
export type CardSlot = { beforeRows?: ReactNode; afterRows?: ReactNode };

/**
 * Where focus goes once a duplicate or a deletion made on the page shows
 * there: a card's ✎, or "Ajouter une carte" (null) when no card is left.
 * `added` and `gone` say what the page must show first.
 */
type FocusAfter = { focus: string | null; added?: string; gone?: string };

const LAYOUTS = {
  grid: "grid gap-5 sm:grid-cols-2 lg:grid-cols-3",
  // One card per line at every width, as wide as the page section.
  wide: "grid gap-5",
  // Tiles on a coloured band, four across on a wide screen, each tilted the
  // other way from its neighbour (ADR 0029).
  band: "grid gap-5 sm:grid-cols-2 lg:grid-cols-4",
};

/**
 * A band tile's own tilt, on the <li>, so the focus ring tilts with the card
 * it outlines and the action strip tilts with the card it sits on.
 */
const BAND_TILT = "odd:-rotate-[1.2deg] even:rotate-1";

/**
 * A grid of raised cards, each a picture on a carnival colour, a heading and
 * its rows. In edit mode every card wears an action strip along its top edge
 * (ADR 0043), ← → ⋯ ✎, and "Ajouter une carte" sits above the grid, so a list
 * saved empty can still be refilled.
 *
 * The editor shows one card but saves the whole list, since deleting a card
 * changes its neighbours' places. On the page, everything saves at once with
 * no dialog and the undo toast: a card's arrows move it, and its ⋯ duplicates
 * it, or deletes it once asked. "Rétablir l'original" restores only the card
 * on screen, and only a card the site ships with.
 *
 * `slots` puts page code into a card by its id, before or after its rows: a
 * link to a page, or a line that depends on what the rows hold. A slot for a
 * card the band deleted shows nowhere.
 *
 * `links` lets a card lead somewhere, a public page or an https address,
 * picked with the buttons' target editor. A card with a target is one big
 * link, so its rows show as text, never as links of their own. A grid with
 * links must therefore have no slot holding a link.
 *
 * The `band` layout is a list, named by the heading `labelledBy` points at.
 */
export function CardsBlock({
  blockKey,
  layout = "grid",
  slots = {},
  links = false,
  labelledBy,
}: {
  blockKey: CardsKey;
  layout?: keyof typeof LAYOUTS;
  slots?: Record<string, CardSlot>;
  links?: boolean;
  labelledBy?: string;
}) {
  const { cards } = useBlock(blockKey);
  const editing = useBlockEditing();
  const [opened, setOpened] = useState<Opened | null>(null);
  const blockLabel = t(BLOCKS[blockKey].label);
  const band = layout === "band";
  const List = band ? "ul" : "div";
  const full = cards.length >= MAX_ITEMS;
  const fullId = useId();
  // The strip's actions save at once, with no dialog to close.
  const { save, pending, error } = useSaveBlock(blockKey, () => {});
  const list = useRef<HTMLElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  const focusAfter = useRef<FocusAfter | null>(null);
  // The card whose deletion is being asked about.
  const [removing, setRemoving] = useState<CardData | null>(null);
  const titleOf = (card: CardData) => tr(card.title).trim() || blockLabel;
  // The move hook slides the cards, says where the moved one went and keeps
  // focus on its arrow once the saved order comes back.
  const moves = useListMoves({
    keys: cards.map((card) => card.id),
    onMove: (id, to) => {
      const moved = [...cards];
      const from = moved.findIndex((card) => card.id === id);
      moved.splice(to, 0, ...moved.splice(from, 1));
      save({ cards: moved } as CardsData);
    },
    announce: (id, n, count) => {
      const card = cards.find((other) => other.id === id);
      return t("blockEditor.cardMoved", { title: card ? titleOf(card) : blockLabel, n, count });
    },
  });

  // The copy goes right after the original with a new id, so its photo slot
  // is its own and starts empty, and page code placed by the original's id
  // stays with the original.
  const duplicate = (index: number) => {
    const copy = { ...structuredClone(cards[index]!), id: crypto.randomUUID() };
    focusAfter.current = { focus: copy.id, added: copy.id };
    save({
      cards: [...cards.slice(0, index + 1), copy, ...cards.slice(index + 1)],
    } as CardsData);
  };

  // useSaveBlock empties the deleted card's photo slot once the list is saved.
  const remove = (card: CardData) => {
    const index = cards.indexOf(card);
    const next = cards[index + 1] ?? cards[index - 1];
    focusAfter.current = { focus: next?.id ?? null, gone: card.id };
    save({ cards: cards.filter((other) => other !== card) } as CardsData);
  };

  // Once the page shows the copy, or no longer shows the deleted card, focus
  // goes to the copy's ✎, to the ✎ of the card that took the deleted one's
  // place, or to "Ajouter une carte" when none is left. The save ends before
  // the page reads the blocks again, and a refused one changes nothing, so
  // focus then stays where it is.
  useEffect(() => {
    const target = focusAfter.current;
    if (target === null || pending) return;
    if (!error) {
      if (target.added && !cards.some((card) => card.id === target.added)) return;
      if (target.gone && cards.some((card) => card.id === target.gone)) return;
    }
    focusAfter.current = null;
    if (error) return;
    if (target.focus === null) {
      addButton.current?.focus();
      return;
    }
    list.current
      ?.querySelector<HTMLElement>(
        `[data-card-id="${CSS.escape(target.focus)}"] [data-action="edit"]`,
      )
      ?.focus();
  }, [pending, cards, error]);

  return (
    <>
      {editing ? (
        <div className="mb-related flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button
            ref={addButton}
            type="button"
            variant="accent"
            size="sm"
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
        // One column of wide cards is always stacked, so its arrows point up
        // and down; a grid's bars find out for themselves.
        <ActionBarList stacked={layout === "wide" || undefined}>
          <List
            ref={list as Ref<HTMLUListElement & HTMLDivElement>}
            className={LAYOUTS[layout]}
            aria-labelledby={band ? labelledBy : undefined}
          >
            {cards.map((card, index) => {
              const view = (
                <CardView
                  key={card.id}
                  blockKey={blockKey}
                  card={card}
                  slot={slots[card.id]}
                  editing={editing}
                  band={band}
                  links={links}
                  itemRef={band ? undefined : moves.itemRef(card.id)}
                >
                  {editing ? (
                    <CardStrip
                      card={card}
                      place={t("blockEditor.cardPlace", {
                        title: titleOf(card),
                        n: index + 1,
                        count: cards.length,
                      })}
                      band={band}
                      moves={moves}
                      // A move waits for the save before it, so it never
                      // starts from a list that lacks that one. Blocks are
                      // written without an ETag, so a stale list would
                      // silently undo the move before instead of failing.
                      busy={pending}
                      onEdit={() => setOpened({ id: card.id, adding: false })}
                      onDuplicate={full ? undefined : () => duplicate(index)}
                      onRemove={() => setRemoving(card)}
                    />
                  ) : null}
                </CardView>
              );
              return band ? (
                <li
                  key={card.id}
                  ref={moves.itemRef(card.id)}
                  className={BAND_TILT}
                  data-card-id={card.id}
                  data-confetti-avoid
                >
                  {view}
                </li>
              ) : (
                view
              );
            })}
          </List>
          {moves.liveRegion}
        </ActionBarList>
      ) : null}

      <AlertDialog
        open={removing !== null}
        onOpenChange={(open) => {
          if (!open) setRemoving(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("blockEditor.removeCardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>{t("blockEditor.removeCardBody")}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              size="lg"
              type="button"
              variant="danger"
              onClick={() => {
                if (removing) remove(removing);
                setRemoving(null);
              }}
            >
              {t("blockEditor.removeCardConfirm")}
            </Button>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {editing || opened !== null ? (
        <CardsEditor
          blockKey={blockKey}
          opened={opened}
          links={links}
          onOpen={setOpened}
          onClose={() => setOpened(null)}
        />
      ) : null}
    </>
  );
}

/**
 * A card's action strip in edit mode (ADR 0043): ← → ⋯ ✎, with ✎ labelled.
 * Every name carries the card's place, "carte 3 sur 5", so a copy can be told
 * from its original. ⋯ holds the same two items as the card editor's header
 * menu; Dupliquer is left out at the limit, where "Ajouter une carte" already
 * says why.
 */
function CardStrip({
  card,
  place,
  band,
  moves,
  busy,
  onEdit,
  onDuplicate,
  onRemove,
}: {
  card: CardData;
  place: string;
  band: boolean;
  moves: ListMoves;
  /** A save is on its way: the arrows wait for it. */
  busy: boolean;
  onEdit: () => void;
  onDuplicate: (() => void) | undefined;
  onRemove: () => void;
}) {
  const missing = lacksGerman(card);
  const edit = t("blockEditor.edit", { label: place });
  const move = (direction: "before" | "after") => {
    const action = moves.moveAction(card.id, direction, {
      label: t(
        direction === "before" ? "blockEditor.moveCardBefore" : "blockEditor.moveCardAfter",
        {
          title: place,
        },
      ),
      word: t(direction === "before" ? "blockEditor.before" : "blockEditor.after"),
    });
    return busy ? { ...action, disabled: true } : action;
  };
  const menu: ActionBarMenuItem[] = [
    ...(onDuplicate
      ? [
          {
            id: "duplicate",
            label: t("blockEditor.duplicateCard"),
            icon: Copy,
            onSelect: onDuplicate,
          },
        ]
      : []),
    {
      id: "remove",
      label: t("blockEditor.removeCard"),
      icon: Trash2,
      destructive: true,
      onSelect: onRemove,
    },
  ];
  const actions: ActionBarAction[] = [
    move("before"),
    move("after"),
    { id: "more", label: t("blockEditor.cardMore", { label: place }), menu },
    {
      id: "edit",
      icon: Pencil,
      word: t("common.edit"),
      label: missing ? t("blockEditor.missingGerman", { text: edit }) : edit,
      flag: missing,
      onSelect: onEdit,
    },
  ];
  return (
    <ActionBar
      look="strip"
      label={place}
      actions={actions}
      main="edit"
      // A raised card's corner is 18px, a band tile's 20px; the strip meets
      // the inner edge of the 3px border.
      className={band ? undefined : "rounded-t-[15px]"}
    />
  );
}

/**
 * One card. The icon is decoration: the heading already says what the card is
 * about, so a card may go without one, and its title then starts at the
 * card's edge.
 *
 * A card with a target is the link itself, through `Card asChild`: one
 * element carrying both class strings, a target far larger than 44px on a
 * phone, whose accessible name is everything the card says. `Slot` joins the
 * two class strings without tailwind-merge, so a `display` class on the link
 * would not override the Card's `flex`. In edit mode the card is no link: its
 * chips and its photo's control are buttons, which a link must not hold, and
 * a stray click would leave the page mid-edit.
 *
 * On a band the icon stands above the title, as on a poster tile, and the
 * title is a level below the band's own heading.
 */
function CardView({
  blockKey,
  card,
  slot,
  editing,
  band,
  links,
  itemRef,
  children,
}: {
  blockKey: CardsKey;
  card: CardData;
  slot: CardSlot | undefined;
  /** Whether the card wears its action strip, and so needs room for it. */
  editing: boolean;
  band: boolean;
  /** Whether the grid lets a card lead somewhere. */
  links: boolean;
  /** The move hook's ref, where no list item of its own holds the card. */
  itemRef?: Ref<HTMLDivElement>;
  children: ReactNode;
}) {
  const Glyph = card.icon === undefined ? undefined : ICON_GLYPHS[card.icon];
  // A read lets any string through, so an imported `javascript:` target must
  // never become an href.
  const target = links && card.to !== undefined && isActionTarget(card.to) ? card.to : undefined;
  const title = tr(card.title);
  const look = band
    ? "h-full gap-3 rounded-[20px] border-3 border-ink p-4 shadow-raised"
    : cn(RAISED_CARD, "gap-0 p-5");
  const rows = <Rows rows={card.rows} plain={target !== undefined} />;

  const body = (
    <>
      {band ? (
        <>
          {Glyph ? (
            <span
              className={cn(
                "grid size-13 place-items-center rounded-[14px] border-3 border-ink",
                TINT_BACKGROUNDS[card.tint],
              )}
            >
              <Glyph aria-hidden="true" className="size-7" strokeWidth={2.25} />
            </span>
          ) : null}
          <h3 className="font-display text-xl text-ink uppercase">{title}</h3>
        </>
      ) : Glyph ? (
        <div className="flex items-center gap-3">
          <span
            className={cn(
              "grid size-11 shrink-0 place-items-center rounded-xl border-3 border-ink",
              TINT_BACKGROUNDS[card.tint],
            )}
          >
            <Glyph aria-hidden="true" className="size-6" strokeWidth={2.25} />
          </span>
          <h2 className="font-display text-xl">{title}</h2>
        </div>
      ) : (
        <h2 className="font-display text-xl">{title}</h2>
      )}
      {/* The slot shows a placeholder to a visitor while empty, like every
          other slot, and carries its own pencil for an editor. */}
      {card.photo ? (
        <SlotPhoto
          slot={cardSlot(blockKey, card.id)}
          label={title.trim() || t(BLOCKS[blockKey].label)}
          alt={title}
        />
      ) : null}
      {slot?.beforeRows}
      {band ? (
        // The card's gap already parts the rows from the title.
        <div className="text-ink-muted [&>:first-child]:mt-0">{rows}</div>
      ) : (
        rows
      )}
      {slot?.afterRows}
    </>
  );

  // On every element the card renders as: a card that is a link becomes one
  // once its editor opens and the page drops its edit chips.
  const editBlock = cardEditTarget(blockKey, card.id);

  if (target !== undefined && !editing) {
    const className = cn(look, "transition-transform hover:-translate-y-0.5");
    return isPublicPage(target) ? (
      // Link keeps a visitor in their language (i18n/routing.tsx).
      <Card asChild data-edit-block={editBlock} className={className}>
        <Link to={target} className="focus-ring">
          {body}
        </Link>
      </Card>
    ) : (
      // Another site opens in a new tab and says so, as every outbound link does.
      <Card asChild data-edit-block={editBlock} className={className}>
        <a
          href={target}
          target="_blank"
          rel="noreferrer"
          aria-label={t("nav.newTab", { name: title })}
          className="focus-ring"
        >
          {body}
        </a>
      </Card>
    );
  }

  return (
    // The card is its strip's scope: edit-blocks.spec.ts checks the strip
    // against its text.
    <Card
      ref={itemRef}
      data-chip-scope
      data-card-id={card.id}
      data-edit-block={editBlock}
      className={cn(look, "relative", editing && ACTION_STRIP_ROOM)}
    >
      {children}
      {body}
    </Card>
  );
}

/** A card's rows; as text alone inside a card that is a link. */
function Rows({ rows, plain }: { rows: CardData["rows"]; plain: boolean }) {
  return rows.map((row, index) => <RowView key={index} row={row} plain={plain} />);
}
