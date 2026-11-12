import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, Pencil, RotateCcw } from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
  type RefObject,
} from "react";
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldErrors,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";

import { Button } from "@ds";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormActions } from "@/components/ui/form-actions";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

import { FormError, formIsValid } from "../../components/FormField";
import { t } from "../../i18n";
import { useBlockPreview, useSavedBlock } from "../BlocksProvider";
import { BLOCKS, type BlockData, type BlockKey } from "../registry";
import { useBlockChanged, useDiscardGuard } from "./DiscardGuard";
import { EditorHeaderSlot } from "./EditorMenu";
import { useKeyboardRoom, usePageBeside } from "./pageBeside";
import { PreviewLanguage } from "./PreviewLanguage";
import { useSaveBlock } from "./useSaveBlock";

type Props<K extends BlockKey> = {
  blockKey: K;
  open: boolean;
  onClose: () => void;
  /** The block's fields, built from the parts in this folder. */
  children: (form: UseFormReturn<BlockData<K>>) => ReactNode;
  /**
   * What "Rétablir l'original" does, for an editor that shows only part of
   * its block; false leaves the button out. By default it fills every field
   * with the shipped block.
   */
  onReset?: ((form: UseFormReturn<BlockData<K>>) => void) | false;
  /**
   * The error line when the block's type refuses a value, for an editor that
   * can say where a refused value it does not show sits. Undefined falls back
   * to the general sentence.
   */
  invalidMessage?: (errors: FieldErrors<BlockData<K>>, values: BlockData<K>) => string | undefined;
  /**
   * What the editor is titled by, for an editor of one part of its block,
   * such as one card; the block's place then stands above it. By default the
   * place's last part ("En-tête") is the title, and the page above it.
   */
  title?: string;
  /**
   * The `data-edit-block` of what stays clear of the fade, for an editor of
   * one part of its block: `blockKey` by default.
   */
  target?: string;
  /**
   * Whether the fields put an `EditorMenu` in the header. Below xl,
   * "Aperçu" then shows as its icon alone, so the title keeps some room.
   */
  menu?: boolean;
};

/**
 * From xl a panel docked at the right, full height, beside the page. Below, a
 * sheet rising from the bottom, full width on a phone and 680px wide and
 * centred from md, scrolling inside. See `usePageBeside` for the page.
 */
const SHELL = [
  "gap-0 border-ink bg-panel p-0 sm:p-0",
  "xl:top-0 xl:right-0 xl:left-auto xl:h-dvh xl:max-h-dvh xl:w-[400px] xl:max-w-[400px] xl:translate-x-0 xl:translate-y-0",
  "xl:rounded-none xl:border-0 xl:border-l-3 xl:content-start xl:data-[state=open]:zoom-in-100",
  "max-xl:top-auto max-xl:bottom-0 max-xl:left-0 max-xl:max-w-full max-xl:translate-x-0 max-xl:translate-y-0 sm:max-w-full",
  "md:max-xl:left-1/2 md:max-xl:max-w-[680px] md:max-xl:-translate-x-1/2",
  "max-xl:rounded-t-[18px] max-xl:rounded-b-none max-xl:border-3 max-xl:border-b-0 max-xl:shadow-[0_-6px_0_0_rgb(0_0_0/0.15)]",
].join(" ");

/** The page and the block itself, from a place such as "Nous rejoindre · en-tête". */
function titled(place: string, title: string | undefined): { above: string; title: string } {
  if (title) return { above: place, title };
  const parts = place.split(" · ");
  const last = parts.pop() ?? place;
  return { above: parts.join(" · "), title: last.charAt(0).toUpperCase() + last.slice(1) };
}

/**
 * The editor of one content block (#106), titled by the block's place on the
 * site. It opens on the block as saved, checks the fields against the block's
 * type, and saves through `useSaveBlock`.
 *
 * The page is its preview (#357): every value the form and the block's type
 * accept shows on the page at once, in this browser only, and the rest of the
 * page fades. So the dialog is not modal and leaves the page in view; the page
 * is inert instead. Below xl, "Aperçu" lowers the sheet to a bar that keeps
 * Save, and "Modifier" raises it again. FR | DE shows the page in either
 * language, with the edit open (#368).
 *
 * "Rétablir l'original" only fills the fields with the shipped content; the
 * editor sees it before deciding to save, and saving it unchanged deletes
 * the stored block.
 *
 * The form is mounted with the dialog's content, so every opening starts from
 * the page's current content rather than from an earlier, abandoned edit.
 *
 * Closing without saving ("Annuler", Escape) asks first once the form holds a
 * change; see `useDiscardGuard`. Radix reports each of them as
 * `onOpenChange(false)`, so a close button added later is covered too. A tap
 * on the faded page does not close it: the editor may only be looking.
 */
export function BlockEditor<K extends BlockKey>({
  open,
  title,
  target,
  menu = false,
  ...props
}: Props<K>) {
  // The form's way out, which knows whether there is anything to lose. The
  // form lives inside the content, so it hands this up.
  const editor = useRef<EditorHandle>(null);
  const close = () => (editor.current ? editor.current.requestClose() : props.onClose());
  const [lowered, setLowered] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const raise = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const placeId = useId();
  const place = t(BLOCKS[props.blockKey].label);
  const heading = titled(place, title);

  usePageBeside(
    open,
    lowered,
    target ?? props.blockKey,
    useCallback(() => shell.current, []),
  );
  const keyboard = useKeyboardRoom(open, lowered);

  // Every opening starts raised.
  useEffect(() => {
    if (!open) setLowered(false);
  }, [open]);

  // Lowering hides the field that had focus; the bar's "Modifier" takes it.
  // Raising does not put it back in the field: on a phone that would bring
  // the keyboard straight back over the page just looked at.
  useEffect(() => {
    if (lowered) raise.current?.focus();
  }, [lowered]);

  return (
    <Dialog modal={false} open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent
        ref={shell}
        overlay={false}
        aria-modal="true"
        // Named by the block's whole place, as before the title was split
        // in two lines: "Comité · contact", whichever card is open.
        aria-labelledby={placeId}
        aria-describedby={undefined}
        className={cn(SHELL, lowered ? "max-xl:max-h-none" : "max-xl:max-h-[90dvh]")}
        style={keyboard}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <span id={placeId} className="sr-only">
          {place}
        </span>
        {lowered ? (
          <div
            role="group"
            aria-label={heading.title}
            className="flex min-w-0 items-center gap-2 p-3"
          >
            <p className="min-w-0 flex-1 truncate font-semibold">{heading.title}</p>
            <Button
              ref={raise}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setLowered(false)}
            >
              <Pencil aria-hidden="true" />
              {t("common.edit")}
            </Button>
            <Button type="submit" size="sm" form={formId}>
              {t("blockEditor.save")}
            </Button>
          </div>
        ) : null}
        {/* Hidden rather than unmounted, so what was typed stays. */}
        <div hidden={lowered} className="contents">
          <EditorForm
            {...props}
            ref={editor}
            formId={formId}
            heading={heading}
            menu={menu}
            onLower={() => setLowered(true)}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}

type EditorHandle = { requestClose: () => void };

function EditorForm<K extends BlockKey>({
  blockKey,
  onClose,
  children,
  onReset,
  invalidMessage,
  ref,
  formId,
  heading,
  menu,
  onLower,
}: Omit<Props<K>, "open" | "title" | "target" | "menu"> & {
  ref: Ref<EditorHandle>;
  formId: string;
  heading: { above: string; title: string };
  menu: boolean;
  onLower: () => void;
}) {
  // Where the fields' EditorMenu shows: a state, so the fields render again
  // once the header has mounted it.
  const [menuSlot, setMenuSlot] = useState<HTMLDivElement | null>(null);
  const definition = BLOCKS[blockKey];
  const current = useSavedBlock(blockKey);
  const formElement = useRef<HTMLFormElement>(null);
  const form = useForm<BlockData<K>>({
    resolver: zodResolver(definition.editSchema ?? definition.schema) as unknown as Resolver<
      BlockData<K>
    >,
    defaultValues: current as DefaultValues<BlockData<K>>,
  });
  const { save, pending, error } = useSaveBlock(blockKey, onClose);
  const { changed, restored } = useBlockChanged(blockKey, form);
  const { requestClose, question } = useDiscardGuard(changed, onClose);
  useImperativeHandle(ref, () => ({ requestClose }), [requestClose]);
  usePreviewOnPage(blockKey, form, formElement);
  // A refusal by the block's type. The field that holds the value says so
  // too, when it is on screen; this line covers the one that is not.
  const [invalid, setInvalid] = useState<string | null>(null);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    // The browser's own checks first (a required text, an e-mail address),
    // in the catalogue's words; then the block's type.
    if (!formIsValid(event.currentTarget)) return;
    setInvalid(null);
    void form.handleSubmit(save, (errors) =>
      setInvalid(invalidMessage?.(errors, form.getValues()) ?? t("blockEditor.invalid")),
    )();
  };

  const reset = () => {
    setInvalid(null);
    restored();
    if (onReset) onReset(form);
    else form.reset(definition.defaults() as BlockData<K>);
  };

  return (
    <FormProvider {...form}>
      {/* One column that may shrink, or the one-line title would widen the sheet. */}
      <form
        ref={formElement}
        id={formId}
        onSubmit={submit}
        noValidate
        className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
      >
        {/* The title and the Save row stay in view while the fields scroll. */}
        <DialogHeader className="sticky top-0 z-10 flex-row items-center gap-3 border-b-2 border-ink/10 bg-panel px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
          <div className="min-w-0 flex-1">
            {heading.above ? (
              <p className="truncate text-sm text-ink-muted">{heading.above}</p>
            ) : null}
            {/* Inline: styles.css balances every heading, which undoes truncate. */}
            <DialogTitle className="truncate" style={{ whiteSpace: "nowrap" }}>
              {heading.title}
            </DialogTitle>
          </div>
          <PreviewLanguage />
          {menu ? (
            <IconButton
              type="button"
              variant="secondary"
              size="sm"
              icon={Eye}
              label={t("blockEditor.preview")}
              className="xl:hidden"
              onClick={onLower}
            />
          ) : (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="xl:hidden"
              onClick={onLower}
            >
              <Eye aria-hidden="true" />
              {t("blockEditor.preview")}
            </Button>
          )}
          {menu ? <div ref={setMenuSlot} className="contents" /> : null}
        </DialogHeader>

        <EditorHeaderSlot value={menuSlot}>
          <div className="space-y-4 px-4 sm:px-6">{children(form)}</div>
        </EditorHeaderSlot>

        <div className="px-4 empty:hidden sm:px-6">
          <FormError error={error ?? (invalid ? { message: invalid, fields: [] } : null)} />
        </div>

        {onReset === false ? null : (
          <Button
            type="button"
            variant="quiet"
            className="mx-4 justify-self-start sm:mx-6"
            onClick={reset}
          >
            <RotateCcw aria-hidden="true" />
            {t("blockEditor.reset")}
          </Button>
        )}

        {/* The one footer, Save first (ADR 0040), as two columns rather than a
            stack on a phone, so the row that stays in view stays low. */}
        <FormActions className="sticky bottom-0 z-10 grid grid-cols-2 gap-3 border-t-2 border-ink/10 bg-panel px-4 pt-3 pb-4 sm:px-6 sm:pb-6">
          <Button type="submit" aria-disabled={pending}>
            {pending ? t("blockEditor.saving") : t("blockEditor.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={requestClose}>
            {t("common.cancel")}
          </Button>
        </FormActions>
      </form>
      {question}
    </FormProvider>
  );
}

/**
 * Shows the form's values on the page while they are typed, and takes them
 * off when the editor closes: after a save the page reads the stored block,
 * after a discard the one it had.
 *
 * Only values the form and the block's type both accept reach the page; until
 * then it keeps the last ones that did. So an emptied title or a half-typed
 * address never collapses or breaks the block on the page.
 */
function usePreviewOnPage<K extends BlockKey>(
  blockKey: K,
  form: UseFormReturn<BlockData<K>>,
  formElement: RefObject<HTMLFormElement | null>,
) {
  const { show, stop } = useBlockPreview();

  useEffect(() => {
    const definition = BLOCKS[blockKey];
    const showIfAccepted = (values: unknown) => {
      // The browser's own checks first: a required text, an e-mail address.
      if (formElement.current && !formElement.current.checkValidity()) return;
      const parsed = (definition.editSchema ?? definition.schema).safeParse(values);
      if (parsed.success) show(blockKey, parsed.data);
    };
    // Once more a frame later: a value set by script ("Rétablir l’original")
    // reaches the field, and so its check, only after the form re-renders.
    let frame = 0;
    const update = () => {
      showIfAccepted(form.getValues());
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => showIfAccepted(form.getValues()));
    };
    update();
    const subscription = form.watch(update);
    return () => {
      subscription.unsubscribe();
      cancelAnimationFrame(frame);
      stop(blockKey);
    };
  }, [blockKey, form, formElement, show, stop]);
}
