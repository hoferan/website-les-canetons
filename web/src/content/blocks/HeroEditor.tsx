import { t } from "../../i18n";
import { ActionsField, BlockEditor, MarkPicker, TranslatedField } from "../editor";
import type { HeroKey } from "./hero";

/**
 * A hero's editor: heading, highlighted words, paragraph and up to two
 * buttons. For a page that lays its hero out itself, as the home page does.
 */
export function HeroEditor({
  blockKey,
  open,
  onClose,
}: {
  blockKey: HeroKey;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <BlockEditor blockKey={blockKey} open={open} onClose={onClose}>
      {() => (
        <>
          <TranslatedField name="title" label={t("blockEditor.field.title")} required />
          <MarkPicker titleName="title" markName="mark" />
          <TranslatedField name="intro" label={t("blockEditor.field.intro")} multiline />
          <ActionsField name="actions" />
        </>
      )}
    </BlockEditor>
  );
}
