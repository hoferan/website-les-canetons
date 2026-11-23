import { Bold, Italic } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import { IconButton } from "@ds";

import { t } from "../../i18n";
import { stylesAt, type Pair } from "../inlineStyles";
import { toggleStyle, type Edit } from "./toggleStyle";

type Props = {
  /** The textarea the bar sits on. */
  target: RefObject<HTMLTextAreaElement | null>;
  value: string;
  onChange: (value: string) => void;
};

/**
 * The B and I on top of a block's longer text (#372). They wrap the selected
 * words in `**` or `*`, or take the stars off again, and Ctrl+B and Ctrl+I in
 * the field do the same. The field keeps showing the stars; the page beside
 * the editor shows the result.
 *
 * A button never takes the focus from the text, so the selection it acts on
 * is still there. The change goes in through the browser's own text insertion
 * where there is one, so Ctrl+Z takes the stars back off rather than the
 * whole text.
 *
 * A labelled group, not a toolbar: a toolbar promises arrow keys between its
 * buttons, and two buttons in the tab order need none.
 */
export function StyleBar({ target, value, onChange }: Props) {
  const [on, setOn] = useState({ bold: false, italic: false });
  // The selection to put back once a change made through onChange has rendered.
  const pending = useRef<Edit | null>(null);

  const refresh = useCallback(() => {
    const area = target.current;
    if (!area) return;
    setOn(stylesAt(area.value, area.selectionStart, area.selectionEnd));
  }, [target]);

  const apply = useCallback(
    (style: Pair["style"]) => {
      const area = target.current;
      if (!area) return;
      const before = area.value;
      const edit = toggleStyle(before, area.selectionStart, area.selectionEnd, style);
      area.focus();
      if (insertAsTyped(area, before, edit.value)) {
        area.setSelectionRange(edit.start, edit.end);
        refresh();
      } else {
        pending.current = edit;
        onChange(edit.value);
      }
    },
    [target, onChange, refresh],
  );

  useLayoutEffect(() => {
    const area = target.current;
    const edit = pending.current;
    pending.current = null;
    if (area && edit && area.value === edit.value) area.setSelectionRange(edit.start, edit.end);
    refresh();
  }, [value, target, refresh]);

  useEffect(() => {
    const area = target.current;
    if (!area) return;
    const onKey = (event: KeyboardEvent) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey) return;
      const key = event.key.toLowerCase();
      if (key !== "b" && key !== "i") return;
      event.preventDefault();
      apply(key === "b" ? "bold" : "italic");
    };
    const follow = ["select", "keyup", "pointerup", "input", "focus"] as const;
    area.addEventListener("keydown", onKey);
    for (const name of follow) area.addEventListener(name, refresh);
    return () => {
      area.removeEventListener("keydown", onKey);
      for (const name of follow) area.removeEventListener(name, refresh);
    };
  }, [target, apply, refresh]);

  const button = (style: Pair["style"]) => (
    <IconButton
      type="button"
      variant="quiet"
      icon={style === "bold" ? Bold : Italic}
      label={t(style === "bold" ? "blockEditor.bold" : "blockEditor.italic")}
      aria-pressed={on[style]}
      className="aria-pressed:bg-yellow"
      // Keeps the focus, and with it the selection, in the text.
      onMouseDown={(event) => event.preventDefault()}
      onClick={() => apply(style)}
    />
  );

  return (
    <div
      role="group"
      aria-label={t("blockEditor.styles")}
      className="flex items-center gap-1 border-b border-input bg-ground p-1"
    >
      {button("bold")}
      {button("italic")}
    </div>
  );
}

/**
 * Replaces what changed between `before` and `after` the way typing would,
 * so the browser's undo history keeps it. False where the browser cannot, and
 * the caller then sets the value itself.
 */
function insertAsTyped(area: HTMLTextAreaElement, before: string, after: string): boolean {
  if (typeof document.execCommand !== "function") return false;
  let head = 0;
  while (head < before.length && head < after.length && before[head] === after[head]) head++;
  let tail = 0;
  while (
    tail < before.length - head &&
    tail < after.length - head &&
    before[before.length - 1 - tail] === after[after.length - 1 - tail]
  ) {
    tail++;
  }
  area.setSelectionRange(head, before.length - tail);
  const inserted = after.slice(head, after.length - tail);
  const done =
    inserted === ""
      ? document.execCommand("delete", false)
      : document.execCommand("insertText", false, inserted);
  return done && area.value === after;
}
