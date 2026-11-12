import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Copy,
  Ellipsis,
  Plus,
  Trash2,
} from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import {
  Controller,
  useFieldArray,
  useFormContext,
  useFormState,
  useWatch,
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
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@ds";
import { Card } from "@/components/ui/card";
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

import { FormError } from "../../components/FormField";
import { Notice } from "../../components/Notice";
import { RAISED_CARD } from "../../carnival/raised";
import { t } from "../../i18n";
import { Link } from "../../i18n/routing";
import { cardSlot } from "../../images/photoSlots";
import { SlotPhoto } from "../../images/SlotPhoto";
import { useBlock } from "../BlocksProvider";
import { PUBLIC_NAV, isPublicPage } from "../publicPages";
import {
  BlockEditor,
  CHIP_ROOM,
  ChipButton,
  EditChip,
  EditorMenu,
  ICON_GLYPHS,
  IconPicker,
  MAX_ITEMS,
  RowFields,
  TargetField,
  TINT_BACKGROUNDS,
  TintPicker,
  TranslatedField,
  useSaveBlock,
} from "../editor";
import { BLOCKS, type BlockData, type BlockKey } from "../registry";
import { lacksGerman, tr } from "../translated";
import { isActionTarget, type Card as CardData, type cardsBlock, type Icon } from "../types";
import { RowView } from "./RowView";
import { useBlockEditing } from "./useBlockEditing";

/** The blocks that are a grid of cards. */
export type CardsKey = {
  [K in BlockKey]: (typeof BLOCKS)[K]["schema"] extends typeof cardsBlock ? K : never;
}[BlockKey];

type CardsData = BlockData<CardsKey>;

/** Page code shown inside the card with that id, which the band does not edit. */
export type CardSlot = { beforeRows?: ReactNode; afterRows?: ReactNode };

/**
 * The card the editor shows, by id: a card being added has no place in the
 * list until the editor appends it. A copy made in the editor knows the
 * title of the card it copies, which its heading names.
 */
type Opened = { id: string; adding: boolean; copyOf?: string };

/** A card's chips, which a move puts focus back on. */
type ChipPart = "before" | "after" | "edit";

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
 * it outlines and the chips tilt with the card they sit on.
 */
const BAND_TILT = "odd:-rotate-[1.2deg] even:rotate-1";

/**
 * A grid of raised cards, each a picture on a carnival colour, a heading and
 * its rows. In edit mode every card carries its own chip, and "Ajouter une
 * carte" sits above the grid, so a list saved empty can still be refilled.
 *
 * The editor shows one card but saves the whole list, since deleting a card
 * changes its neighbours' places. A card's arrows move it and save at once,
 * with no dialog. "Rétablir l'original" restores only the card on screen,
 * and only a card the site ships with.
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
  // Remounts the card's fields after a reset, so every field reads it.
  const [resets, setResets] = useState(0);
  const blockLabel = t(BLOCKS[blockKey].label);
  const band = layout === "band";
  const List = band ? "ul" : "div";
  const full = cards.length >= MAX_ITEMS;
  const fullId = useId();
  // Moving a card saves at once, with no dialog to close.
  const { save, pending, error } = useSaveBlock(blockKey, () => {});
  const chipIds = useId();
  const chipId = (cardId: string, part: ChipPart) => `${chipIds}-${cardId}-${part}`;
  // The arrow a move was made with, to focus again on the moved card.
  const refocus = useRef<{ id: string; part: ChipPart; to: number } | null>(null);
  const shipped = opened
    ? BLOCKS[blockKey].defaults().cards.find((card) => card.id === opened.id)
    : undefined;
  const openedCard = opened ? cards.find((card) => card.id === opened.id) : undefined;
  const openedTitle = openedCard ? tr(openedCard.title).trim() || undefined : undefined;

  // The arrows are disabled while a save is on its way, so a move never starts
  // from a list that lacks the one before it. Blocks are written without an
  // ETag, so a stale list would silently undo that move instead of failing.
  const shift = (from: number, to: number) => {
    const moved = [...cards];
    moved.splice(to, 0, ...moved.splice(from, 1));
    refocus.current = { id: cards[from]!.id, part: to < from ? "before" : "after", to };
    save({ cards: moved } as CardsData);
  };

  // Once the page shows the move, focus goes to the same arrow of the moved
  // card, so the next key press moves it on, or to its pencil when that arrow
  // is gone (the card is now first or last). The card's buttons can be moved
  // or unmounted under the focus, which leaves it on the page. Focus the
  // person has taken elsewhere meanwhile stays where it is.
  useEffect(() => {
    const target = refocus.current;
    if (target === null || pending) return;
    // The save can end a render before the page shows the new order; a
    // refused one leaves the card where it was.
    if (cards[target.to]?.id !== target.id && !error) return;
    refocus.current = null;
    const active = document.activeElement;
    const lost = active === null || active === document.body || !active.isConnected;
    if (!lost && !active.id.startsWith(chipIds)) return;
    (
      document.getElementById(`${chipIds}-${target.id}-${target.part}`) ??
      document.getElementById(`${chipIds}-${target.id}-edit`)
    )?.focus();
  }, [pending, cards, error, chipIds]);

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
            variant="accent"
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
        <List className={LAYOUTS[layout]} aria-labelledby={band ? labelledBy : undefined}>
          {cards.map((card, index) => {
            const title = tr(card.title).trim() || blockLabel;
            // Left and right where the grid shows columns (from sm), up and
            // down where it stacks, so the arrow points where the card goes.
            const several = layout !== "wide";
            const view = (
              <CardView
                key={card.id}
                blockKey={blockKey}
                card={card}
                slot={slots[card.id]}
                editing={editing}
                band={band}
                links={links}
              >
                {editing ? (
                  // One row in the card's corner, the pencil last: its word
                  // shows on hover from sm and widens it leftwards, which
                  // pushes the arrows along instead of covering them.
                  <div className="absolute top-2 right-2 z-10 flex gap-2">
                    {index > 0 ? (
                      <ChipButton
                        id={chipId(card.id, "before")}
                        label={t("blockEditor.moveCardBefore", { title })}
                        word={t("blockEditor.before")}
                        icon={several ? ArrowLeft : ArrowUp}
                        narrowIcon={several ? ArrowUp : undefined}
                        disabled={pending}
                        onClick={() => shift(index, index - 1)}
                      />
                    ) : null}
                    {index < cards.length - 1 ? (
                      <ChipButton
                        id={chipId(card.id, "after")}
                        label={t("blockEditor.moveCardAfter", { title })}
                        word={t("blockEditor.after")}
                        icon={several ? ArrowRight : ArrowDown}
                        narrowIcon={several ? ArrowDown : undefined}
                        disabled={pending}
                        onClick={() => shift(index, index + 1)}
                      />
                    ) : null}
                    <EditChip
                      id={chipId(card.id, "edit")}
                      label={title}
                      corner={false}
                      missingGerman={lacksGerman(card)}
                      onClick={() => setOpened({ id: card.id, adding: false })}
                    />
                  </div>
                ) : null}
              </CardView>
            );
            return band ? (
              <li key={card.id} className={BAND_TILT} data-confetti-avoid>
                {view}
              </li>
            ) : (
              view
            );
          })}
        </List>
      ) : null}

      {editing || opened !== null ? (
        <BlockEditor
          blockKey={blockKey}
          // The card itself, live as its title is typed; a new one has none
          // yet, and an unsaved copy says what it copies.
          title={
            opened?.copyOf !== undefined
              ? t("blockEditor.copyOf", { title: opened.copyOf || blockLabel })
              : openedTitle
          }
          menu
          target={opened ? cardEditTarget(blockKey, opened.id) : undefined}
          open={opened !== null}
          onClose={() => setOpened(null)}
          onReset={shipped ? restore : false}
          invalidMessage={elsewhere}
        >
          {() =>
            opened ? <CardEditor key={resets} {...opened} links={links} onOpen={setOpened} /> : null
          }
        </BlockEditor>
      ) : null}
    </>
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
  children,
}: {
  blockKey: CardsKey;
  card: CardData;
  slot: CardSlot | undefined;
  /** Whether the card wears its chip, and so needs room for it. */
  editing: boolean;
  band: boolean;
  /** Whether the grid lets a card lead somewhere. */
  links: boolean;
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
    // The card is its chips' scope: edit-blocks.spec.ts checks them against
    // its text, and against each other.
    <Card
      data-chip-scope
      data-edit-block={editBlock}
      className={cn(look, "relative", editing && CHIP_ROOM)}
    >
      {children}
      {body}
    </Card>
  );
}

/** What a card is found by while its editor is open (`BlockEditor`'s `target`). */
const cardEditTarget = (blockKey: CardsKey, cardId: string) => `${blockKey}/${cardId}`;

/** A card's rows; as text alone inside a card that is a link. */
function Rows({ rows, plain }: { rows: CardData["rows"]; plain: boolean }) {
  return rows.map((row, index) => <RowView key={index} row={row} plain={plain} />);
}

/**
 * Whether the card leads somewhere, and where. Off, the target is held as ""
 * and saved as absent (see `forEditor`). The switch keeps its own state, so
 * emptying a typed address does not switch the link off under the cursor.
 */
function LinkFields({ name }: { name: `cards.${number}.to` }) {
  const { getValues, setValue } = useFormContext<CardsData>();
  const id = useId();
  const [linked, setLinked] = useState(() => (getValues(name) ?? "") !== "");
  return (
    <>
      <div className="flex min-h-touch items-center justify-between gap-2">
        <label htmlFor={id}>{t("blockEditor.field.link")}</label>
        <Switch
          id={id}
          checked={linked}
          onCheckedChange={(on) => {
            setLinked(on);
            setValue(name, on ? PUBLIC_NAV[0]!.to : "", { shouldDirty: true });
          }}
        />
      </div>
      {linked ? <TargetField name={name} /> : null}
    </>
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

/**
 * Whether the card wears an icon, and which one in which colour. Off, the
 * icon is held as "" and saved as absent (see `forEditor`); the colour tints
 * only the icon's tile, so it hides too but stays in the form. On again, the
 * card gets back the icon it last had, or a star.
 */
function IconFields({ index }: { index: number }) {
  const { getValues, setValue } = useFormContext<CardsData>();
  const name = `cards.${index}.icon` as const;
  // Absent on a card stored without one, "" once switched off here.
  const icon = useWatch<CardsData, typeof name>({ name }) as Icon | "" | undefined;
  // The icon to bring back, taken when the switch goes off.
  const last = useRef<Icon>(icon || "star");
  const id = useId();
  const labelId = useId();
  return (
    <>
      <div className="flex min-h-touch items-center justify-between gap-2">
        <label id={labelId} htmlFor={id}>
          {t("blockEditor.icon")}
        </label>
        <Switch
          id={id}
          checked={Boolean(icon)}
          onCheckedChange={(on) => {
            if (!on) last.current = getValues(name) || last.current;
            setValue(name, (on ? last.current : "") as Icon, { shouldDirty: true });
          }}
        />
      </div>
      {icon ? (
        <>
          <IconPicker name={name} labelledBy={labelId} />
          <TintPicker name={`cards.${index}.tint`} />
        </>
      ) : null}
    </>
  );
}

function newCard(id: string): CardData {
  return { id, icon: "star", tint: "yellow", title: { fr: "" }, rows: [] };
}

/**
 * The fields of the card being edited, inside the block's editor. It finds
 * its card by id, so a card being added shows once the effect below has
 * appended it.
 *
 * The card's own actions sit in the editor's header menu (ADR 0043), which
 * stays in view while the fields scroll:
 *
 * - "Dupliquer la carte" puts a copy right after the card and opens the copy
 *   in the same unsaved form, so Enregistrer stores both cards and Annuler
 *   drops the copy with any other change. The copy gets a new id: its photo
 *   slot is its own and starts empty, and page code placed by the original's
 *   id stays with the original.
 * - "Supprimer la carte" asks first, then saves the list at once through the
 *   editor's own submit, so its checks and its error line apply. That submit
 *   stores the form's other changes too, which the question then says.
 */
function CardEditor({
  id,
  adding,
  copyOf,
  links,
  onOpen,
}: Opened & { links: boolean; onOpen: (opened: Opened) => void }) {
  const { control, getValues, setFocus } = useFormContext<CardsData>();
  const { append, insert, remove } = useFieldArray({ control, name: "cards" });
  const { isDirty } = useFormState({ control });
  // Read from the form, which the append and the removal change before the
  // re-render they cause; useWatch would lag one render behind.
  const cards = getValues("cards");
  const index = cards.findIndex((card) => card.id === id);
  const [confirming, setConfirming] = useState(false);
  // Whether the form held other changes when the question was asked.
  const [othersChanged, setOthersChanged] = useState(false);
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

  // The copy's title takes focus once its fields are mounted, so the editor
  // knows the card on screen changed and can type the new name at once. The
  // closing menu leaves it there: Radix only returns focus to its button
  // when nothing else has taken it.
  const focusTitle = useRef(false);
  useEffect(() => {
    if (!focusTitle.current || index === -1) return;
    focusTitle.current = false;
    setFocus(`cards.${index}.title`);
  }, [index, setFocus]);

  const duplicate = () => {
    const original = getValues(`cards.${index}`);
    const copy = { ...structuredClone(original), id: crypto.randomUUID() };
    insert(index + 1, copy, { shouldFocus: false });
    focusTitle.current = true;
    onOpen({ id: copy.id, adding: false, copyOf: tr(original.title).trim() });
  };

  const shown = !deleted && index !== -1;

  return (
    <div ref={root} className="space-y-4">
      {shown ? (
        <EditorMenu>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <IconButton
                type="button"
                variant="secondary"
                size="sm"
                icon={Ellipsis}
                label={t("blockEditor.cardActions")}
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {/* Left out at the limit: "Ajouter une carte" on the page
                  already says why. */}
              {cards.length < MAX_ITEMS ? (
                <>
                  <DropdownMenuItem onSelect={duplicate}>
                    <Copy aria-hidden="true" />
                    {t("blockEditor.duplicateCard")}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                </>
              ) : null}
              <DropdownMenuItem
                destructive
                onSelect={() => {
                  setOthersChanged(isDirty);
                  setConfirming(true);
                }}
              >
                <Trash2 aria-hidden="true" />
                {t("blockEditor.removeCard")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </EditorMenu>
      ) : null}

      {shown ? (
        <>
          {copyOf !== undefined ? (
            <Notice>
              {t("blockEditor.copyNote", {
                save: t("blockEditor.save"),
                cancel: t("common.cancel"),
              })}
            </Notice>
          ) : null}
          {/* Keyed by place, so the fields mount on the card's own path. */}
          <div key={index} className="space-y-4">
            <TranslatedField
              name={`cards.${index}.title`}
              label={t("blockEditor.field.title")}
              required
            />
            <IconFields index={index} />
            {links ? <LinkFields name={`cards.${index}.to`} /> : null}
            <PhotoSwitch name={`cards.${index}.photo`} />
            <RowFields name={`cards.${index}.rows`} />
          </div>
        </>
      ) : null}

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("blockEditor.removeCardTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("blockEditor.removeCardBody")}
              {othersChanged ? <> {t("blockEditor.removeCardSavesChanges")}</> : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="danger"
              onClick={() => {
                setConfirming(false);
                remove(index);
                setDeleted(true);
              }}
            >
              {t("blockEditor.removeCardConfirm")}
            </Button>
            <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
