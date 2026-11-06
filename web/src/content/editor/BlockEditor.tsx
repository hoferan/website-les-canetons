import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw } from "lucide-react";
import {
  useImperativeHandle,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from "react";
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type FieldErrors,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { FormError, formIsValid } from "../../components/FormField";
import { t } from "../../i18n";
import { useBlock } from "../BlocksProvider";
import { BLOCKS, type BlockData, type BlockKey } from "../registry";
import { useBlockChanged, useDiscardGuard } from "./DiscardGuard";
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
};

/**
 * The raised carnival surface on every screen, and on a phone a bottom sheet:
 * full width, square at the bottom edge, scrolling inside.
 */
const SHEET = [
  "rounded-[18px] border-3 border-ink bg-panel shadow-raised",
  "max-sm:top-auto max-sm:bottom-0 max-sm:left-0 max-sm:translate-x-0 max-sm:translate-y-0",
  "max-sm:max-h-[90dvh] max-sm:max-w-full max-sm:rounded-b-none max-sm:border-b-0 max-sm:shadow-none",
].join(" ");

/**
 * The dialog that changes one content block (#106), titled by the block's
 * place on the site. It opens on what the page shows now, checks the fields
 * against the block's type, and saves through `useSaveBlock`.
 *
 * "Rétablir l'original" only fills the fields with the shipped content; the
 * editor sees it before deciding to save, and saving it unchanged deletes
 * the stored block.
 *
 * The form is mounted with the dialog's content, so every opening starts from
 * the page's current content rather than from an earlier, abandoned edit.
 *
 * Closing without saving ("Annuler", Escape, a tap outside) asks first once
 * the form holds a change; see `useDiscardGuard`. Radix reports each of them
 * as `onOpenChange(false)`, so a close button added later is covered too.
 */
export function BlockEditor<K extends BlockKey>({ open, ...props }: Props<K>) {
  // The form's way out, which knows whether there is anything to lose. The
  // form lives inside the content, so it hands this up.
  const editor = useRef<EditorHandle>(null);
  const close = () => (editor.current ? editor.current.requestClose() : props.onClose());

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : close())}>
      <DialogContent aria-describedby={undefined} className={SHEET}>
        <EditorForm {...props} ref={editor} />
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
}: Omit<Props<K>, "open"> & { ref: Ref<EditorHandle> }) {
  const definition = BLOCKS[blockKey];
  const current = useBlock(blockKey);
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
      <form onSubmit={submit} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{t(definition.label)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">{children(form)}</div>

        <FormError error={error ?? (invalid ? { message: invalid, fields: [] } : null)} />

        <DialogFooter>
          <Button type="submit" aria-disabled={pending}>
            {pending ? t("blockEditor.saving") : t("blockEditor.save")}
          </Button>
          <Button type="button" variant="secondary" onClick={requestClose}>
            {t("common.cancel")}
          </Button>
          {onReset === false ? null : (
            <Button type="button" variant="quiet" onClick={reset}>
              <RotateCcw aria-hidden="true" />
              {t("blockEditor.reset")}
            </Button>
          )}
        </DialogFooter>
      </form>
      {question}
    </FormProvider>
  );
}
