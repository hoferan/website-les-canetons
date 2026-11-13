import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw } from "lucide-react";
import {
  useEffect,
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

import { formIsValid } from "../../components/FormField";
import { t } from "../../i18n";
import { useBlockPreview, useSavedBlock } from "../BlocksProvider";
import { BLOCKS, type BlockData, type BlockKey } from "../registry";
import { useBlockChanged, useDiscardGuard } from "./DiscardGuard";
import { EditorPanel, EditorPanelForm } from "./EditorPanel";
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

/** The page and the block itself, from a place such as "Nous rejoindre · en-tête". */
function titled(place: string, title: string | undefined): { above: string; title: string } {
  if (title) return { above: place, title };
  const parts = place.split(" · ");
  const last = parts.pop() ?? place;
  return { above: parts.join(" · "), title: last.charAt(0).toUpperCase() + last.slice(1) };
}

/**
 * The editor of one content block (#106), in the side panel every public
 * page edits in (`EditorPanel`), titled by the block's place on the site. It
 * opens on the block as saved, checks the fields against the block's type,
 * and saves through `useSaveBlock`.
 *
 * Every value the form and the block's type accept shows on the page at once,
 * in this browser only (#357).
 *
 * "Rétablir l'original" only fills the fields with the shipped content; the
 * editor sees it before deciding to save, and saving it unchanged deletes
 * the stored block.
 *
 * Closing without saving ("Annuler", Escape) asks first once the form holds a
 * change; see `useDiscardGuard`.
 */
export function BlockEditor<K extends BlockKey>({
  open,
  title,
  target,
  menu = false,
  ...props
}: Props<K>) {
  // The form's way out, which knows whether there is anything to lose. The
  // form lives inside the panel's content, so it hands this up.
  const editor = useRef<EditorHandle>(null);
  const close = () => (editor.current ? editor.current.requestClose() : props.onClose());
  // Named by the block's whole place, as before the title was split in two
  // lines: "Comité · contact", whichever card is open.
  const place = t(BLOCKS[props.blockKey].label);
  const heading = titled(place, title);

  return (
    <EditorPanel
      open={open}
      onRequestClose={close}
      label={place}
      above={heading.above}
      title={heading.title}
      target={target ?? props.blockKey}
      menu={menu}
    >
      <EditorForm {...props} ref={editor} />
    </EditorPanel>
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
}: Omit<Props<K>, "open" | "title" | "target" | "menu"> & { ref: Ref<EditorHandle> }) {
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
      <EditorPanelForm
        formRef={formElement}
        onSubmit={submit}
        pending={pending}
        error={error ?? (invalid ? { message: invalid, fields: [] } : null)}
        onCancel={requestClose}
        extra={
          onReset === false ? null : (
            <Button
              type="button"
              variant="quiet"
              className="mx-4 justify-self-start sm:mx-6"
              onClick={reset}
            >
              <RotateCcw aria-hidden="true" />
              {t("blockEditor.reset")}
            </Button>
          )
        }
      >
        {children(form)}
      </EditorPanelForm>
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
