import { Eye, Pencil } from "lucide-react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
  type Ref,
} from "react";

import { Button } from "@ds";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { FormActions } from "@/components/ui/form-actions";
import { IconButton } from "@/components/ui/icon-button";
import { cn } from "@/lib/utils";

import { FormError } from "../../components/FormField";
import { t, type TranslatedError } from "../../i18n";
import { EditorHeaderSlot } from "./EditorMenu";
import { useKeyboardRoom, usePageBeside } from "./pageBeside";
import { PreviewLanguage } from "./PreviewLanguage";

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

/** What the panel hands its form: where it is, what it is called, how to lower. */
type PanelState = {
  formId: string;
  above: string;
  title: string;
  menu: boolean;
  lower: () => void;
};

const Panel = createContext<PanelState | null>(null);

/**
 * The side panel every editor on a public page opens in (#106, #357, #419):
 * page blocks through `BlockEditor`, history entries through `HistoryPanel`.
 *
 * The page is its preview: the dialog is not modal and leaves the page in
 * view, the page is inert instead, and everything but the element marked
 * `data-edit-block={target}` fades. Below xl, "Aperçu" lowers the sheet to a
 * bar that keeps Save, and "Modifier" raises it again. FR | DE shows the page
 * in either language, with the edit open (#368).
 *
 * Every way out but a save goes through `onRequestClose` (Escape, Annuler,
 * and any close button Radix reports as `onOpenChange(false)`), so the editor
 * can ask before it discards anything. A tap on the faded page does not
 * close it: the editor may only be looking.
 *
 * `label` names the dialog for a screen reader, the whole place ("Comité ·
 * contact"); `above` and `title` are the header's two lines. The form inside
 * is `EditorPanelForm`, mounted with the content, so every opening starts
 * from the page as it is rather than from an abandoned edit.
 */
export function EditorPanel({
  open,
  onRequestClose,
  label,
  above,
  title,
  target,
  menu = false,
  children,
}: {
  open: boolean;
  onRequestClose: () => void;
  label: string;
  above: string;
  title: string;
  target: string;
  /** Whether the form puts an `EditorMenu` in the header, so "Aperçu" folds to its icon. */
  menu?: boolean;
  children: ReactNode;
}) {
  const [lowered, setLowered] = useState(false);
  const shell = useRef<HTMLDivElement>(null);
  const raise = useRef<HTMLButtonElement>(null);
  const formId = useId();
  const labelId = useId();

  usePageBeside(
    open,
    lowered,
    target,
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

  const state: PanelState = { formId, above, title, menu, lower: () => setLowered(true) };

  return (
    <Dialog modal={false} open={open} onOpenChange={(next) => (next ? null : onRequestClose())}>
      <DialogContent
        ref={shell}
        overlay={false}
        aria-modal="true"
        aria-labelledby={labelId}
        aria-describedby={undefined}
        className={cn(SHELL, lowered ? "max-xl:max-h-none" : "max-xl:max-h-[90dvh]")}
        style={keyboard}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <span id={labelId} className="sr-only">
          {label}
        </span>
        {lowered ? (
          <div role="group" aria-label={title} className="flex min-w-0 items-center gap-2 p-3">
            <p className="min-w-0 flex-1 truncate font-semibold">{title}</p>
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
          <Panel.Provider value={state}>{children}</Panel.Provider>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The form inside an `EditorPanel`: the title and FR | DE above, the fields,
 * the error line, and Save and Annuler below. The header and the Save row
 * stay in view while the fields scroll.
 *
 * It owns no values: the editor inside keeps them and decides what a submit
 * does. `pending` keeps a second Save from sending twice. `extra` goes under
 * the error line, such as "Rétablir l'original".
 */
export function EditorPanelForm({
  onSubmit,
  pending,
  error,
  onCancel,
  extra,
  formRef,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  pending: boolean;
  error: TranslatedError | null;
  onCancel: () => void;
  extra?: ReactNode;
  formRef?: Ref<HTMLFormElement>;
  children: ReactNode;
}) {
  const panel = useContext(Panel);
  if (!panel) throw new Error("EditorPanelForm needs an EditorPanel around it");
  const { formId, above, title, menu, lower } = panel;
  // Where the fields' EditorMenu shows: a state, so the fields render again
  // once the header has mounted it.
  const [menuSlot, setMenuSlot] = useState<HTMLDivElement | null>(null);

  return (
    // One column that may shrink, or the one-line title would widen the sheet.
    <form
      ref={formRef}
      id={formId}
      onSubmit={onSubmit}
      noValidate
      className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4"
    >
      <DialogHeader className="sticky top-0 z-10 flex-row items-center gap-3 border-b-2 border-ink/10 bg-panel px-4 pt-4 pb-3 sm:px-6 sm:pt-6">
        <div className="min-w-0 flex-1">
          {above ? <p className="truncate text-sm text-ink-muted">{above}</p> : null}
          {/* Inline: styles.css balances every heading, which undoes truncate. */}
          <DialogTitle className="truncate" style={{ whiteSpace: "nowrap" }}>
            {title}
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
            onClick={lower}
          />
        ) : (
          <Button type="button" variant="secondary" size="sm" className="xl:hidden" onClick={lower}>
            <Eye aria-hidden="true" />
            {t("blockEditor.preview")}
          </Button>
        )}
        {menu ? <div ref={setMenuSlot} className="contents" /> : null}
      </DialogHeader>

      <EditorHeaderSlot value={menuSlot}>
        <div className="space-y-4 px-4 sm:px-6">{children}</div>
      </EditorHeaderSlot>

      <div className="px-4 empty:hidden sm:px-6">
        <FormError error={error} />
      </div>

      {extra}

      {/* The one footer, Save first (ADR 0040), as two columns rather than a
          stack on a phone, so the row that stays in view stays low. */}
      <FormActions className="sticky bottom-0 z-10 grid grid-cols-2 gap-3 border-t-2 border-ink/10 bg-panel px-4 pt-3 pb-4 sm:px-6 sm:pb-6">
        <Button type="submit" aria-disabled={pending}>
          {pending ? t("blockEditor.saving") : t("blockEditor.save")}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
      </FormActions>
    </form>
  );
}
