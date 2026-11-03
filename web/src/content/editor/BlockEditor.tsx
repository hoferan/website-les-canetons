import { zodResolver } from "@hookform/resolvers/zod";
import { RotateCcw } from "lucide-react";
import type { FormEvent, ReactNode } from "react";
import {
  FormProvider,
  useForm,
  type DefaultValues,
  type Resolver,
  type UseFormReturn,
} from "react-hook-form";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

import { FormError, formIsValid } from "../../components/FormField";
import { t } from "../../i18n";
import { useBlock } from "../BlocksProvider";
import { BLOCKS, type BlockData, type BlockKey } from "../registry";
import { useSaveBlock } from "./useSaveBlock";

type Props<K extends BlockKey> = {
  blockKey: K;
  open: boolean;
  onClose: () => void;
  /** The block's fields, built from the parts in this folder. */
  children: (form: UseFormReturn<BlockData<K>>) => ReactNode;
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
 */
export function BlockEditor<K extends BlockKey>({ blockKey, open, onClose, children }: Props<K>) {
  return (
    <Dialog open={open} onOpenChange={(next) => (next ? null : onClose())}>
      <DialogContent aria-describedby={undefined} className={SHEET}>
        <EditorForm blockKey={blockKey} onClose={onClose}>
          {children}
        </EditorForm>
      </DialogContent>
    </Dialog>
  );
}

function EditorForm<K extends BlockKey>({ blockKey, onClose, children }: Omit<Props<K>, "open">) {
  const definition = BLOCKS[blockKey];
  const current = useBlock(blockKey);
  const form = useForm<BlockData<K>>({
    resolver: zodResolver(definition.schema) as unknown as Resolver<BlockData<K>>,
    defaultValues: current as DefaultValues<BlockData<K>>,
  });
  const { save, pending, error } = useSaveBlock(blockKey, onClose);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    // The browser's own checks first (a required text, an e-mail address),
    // in the catalogue's words; then the block's type.
    if (!formIsValid(event.currentTarget)) return;
    void form.handleSubmit(save)();
  };

  const reset = () => form.reset(definition.defaults() as BlockData<K>);

  return (
    <FormProvider {...form}>
      <form onSubmit={submit} noValidate className="grid gap-4">
        <DialogHeader>
          <DialogTitle>{t(definition.label)}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">{children(form)}</div>

        <FormError error={error} />

        {/* In the order a phone stacks them, the save first. From sm up they
            line up from the right, and Rétablir moves to the far left. */}
        <div className="flex flex-col gap-2 sm:flex-row-reverse sm:flex-wrap">
          <Button type="submit" variant="raised" aria-disabled={pending}>
            {pending ? t("blockEditor.saving") : t("blockEditor.save")}
          </Button>
          <Button type="button" variant="raised-light" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="button" variant="ghost" onClick={reset} className="sm:mr-auto">
            <RotateCcw aria-hidden="true" />
            {t("blockEditor.reset")}
          </Button>
        </div>
      </form>
    </FormProvider>
  );
}
