import { Copy, Ellipsis, Trash2 } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
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
import { IconButton } from "@/components/ui/icon-button";
import { Switch } from "@/components/ui/switch";

import { Notice } from "../../components/Notice";
import { t } from "../../i18n";
import { useBlock } from "../BlocksProvider";
import {
  BlockEditor,
  EditorMenu,
  IconPicker,
  RowFields,
  TargetField,
  TintPicker,
  TranslatedField,
} from "../editor";
import { PUBLIC_NAV } from "../publicPages";
import { BLOCKS } from "../registry";
import { tr } from "../translated";
import { MAX_ITEMS, type Card as CardData, type Icon } from "../types";
import { cardEditTarget, type CardsData, type CardsKey, type Opened } from "./cards";

/**
 * A grid of cards' editor, on the card `opened` names, for `CardsBlock`. Its
 * own module, loaded in edit mode only, so a visitor's bundle carries none
 * of the form code (#396).
 *
 * It shows one card but saves the whole list, since deleting a card changes
 * its neighbours' places.
 */
export function CardsEditor({
  blockKey,
  opened,
  links,
  onOpen,
  onClose,
}: {
  blockKey: CardsKey;
  opened: Opened | null;
  links: boolean;
  onOpen: (opened: Opened) => void;
  onClose: () => void;
}) {
  const { cards } = useBlock(blockKey);
  const blockLabel = t(BLOCKS[blockKey].label);
  // Remounts the card's fields after a reset, so every field reads it.
  const [resets, setResets] = useState(0);
  const shipped = opened
    ? BLOCKS[blockKey].defaults().cards.find((card) => card.id === opened.id)
    : undefined;
  const openedCard = opened ? cards.find((card) => card.id === opened.id) : undefined;
  const openedTitle = openedCard ? tr(openedCard.title).trim() || undefined : undefined;

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
      onClose={onClose}
      onReset={shipped ? restore : false}
      invalidMessage={elsewhere}
    >
      {() =>
        opened ? <CardEditor key={resets} {...opened} links={links} onOpen={onOpen} /> : null
      }
    </BlockEditor>
  );
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
              size="lg"
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
