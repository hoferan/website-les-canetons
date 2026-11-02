import { Pencil } from "lucide-react";
import { lazy, Suspense, useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

import { t, type TranslationKey } from "../i18n";
import { useSession } from "../session/SessionProvider";
import { useEditMode } from "./EditMode";
import { useTextsVersion } from "./TextsProvider";

// Only an editor ever opens it, so no visitor downloads the dialog.
const TextDialog = lazy(() =>
  import("./TextDialog").then((module) => ({ default: module.TextDialog })),
);

type Props = {
  /** The catalogue key: the text's default, and its name on the server. */
  k: TranslationKey;
  /** The element each line renders in. */
  as?: "p" | "span" | "h2" | "li";
  className?: string;
  /** One element per non-empty line, for lists such as contacts. */
  multiline?: boolean;
  /**
   * The same in both languages (a name, a number, an address, a link): one
   * field in the dialog, stored in both.
   */
  neutral?: boolean;
  /** Turns a Swiss phone number inside a line into a tel: link. */
  phones?: boolean;
  /** What a visitor sees while the text is empty. */
  empty?: ReactNode;
  /**
   * What the pencil and the dialog call the text. Defaults to the start of the
   * text itself; give one for a text that may be empty or is not prose.
   */
  label?: string;
  /** A check on a value before it is saved: null, or what is wrong with it. */
  validate?: (value: string) => string | null;
  /**
   * A blank field stores "nothing here" instead of putting the original back,
   * for a text the page can do without (a network the band has no account on).
   */
  allowEmpty?: boolean;
  /** Renders the text another way (a link around it, say); the pencil stays. */
  children?: (text: string) => ReactNode;
};

/**
 * A text of a public page that the band can change where it is shown (#106).
 *
 * It renders `t(k)`, which already holds the band's wording (TextsProvider),
 * and, in edit mode, a pencil for whoever holds `content.manage`. A new
 * editable text is this component with a catalogue key: nothing to add on the
 * server, whose table takes any key.
 */
export function EditableText({
  k,
  as: Tag = "span",
  className,
  multiline = false,
  neutral = false,
  phones = false,
  empty,
  label,
  validate,
  allowEmpty = false,
  children,
}: Props) {
  // Read so a saved text renders again: t() itself is a plain function.
  useTextsVersion();
  const { can } = useSession();
  const editMode = useEditMode();
  const [editing, setEditing] = useState(false);

  const text = t(k);
  const editable = editMode.on && can("content.manage");
  const name = label ?? excerpt(text);

  const pencil = editable ? (
    <button
      type="button"
      onClick={() => setEditing(true)}
      aria-label={t("texts.edit", { label: name })}
      className="ml-1.5 inline-flex size-touch shrink-0 items-center justify-center rounded-full border-2 border-ink bg-yellow align-middle text-ink hover:bg-yellow/85 focus-visible:outline-2 focus-visible:outline-violet"
    >
      <Pencil aria-hidden="true" className="size-4" />
    </button>
  ) : null;

  const dialog = editing ? (
    <Suspense fallback={null}>
      <TextDialog
        k={k}
        label={name}
        neutral={neutral}
        multiline={multiline}
        validate={validate}
        allowEmpty={allowEmpty}
        onClose={() => setEditing(false)}
      />
    </Suspense>
  ) : null;

  const render = (value: string) =>
    children ? children(value) : phones ? linkPhones(value) : value;
  const lines = multiline ? text.split("\n").filter((line) => line.trim() !== "") : [text];

  if (text.trim() === "" || lines.length === 0) {
    if (!empty && !pencil) return null;
    return (
      <Tag className={className}>
        {empty}
        {pencil}
        {dialog}
      </Tag>
    );
  }

  return (
    <>
      {lines.map((line, index) => (
        <Tag key={index} className={cn(className)}>
          {render(line)}
          {index === lines.length - 1 ? (
            <>
              {pencil}
              {dialog}
            </>
          ) : null}
        </Tag>
      ))}
    </>
  );
}

/** The start of a text, for a pencil's name when the page gives none. */
function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 40 ? `${flat.slice(0, 40)}…` : flat;
}

/**
 * A Swiss number as people write it: 079 123 45 67, 026 555 12 34,
 * +41 26 555 12 34 or 0041 26 555 12 34, spaces optional.
 */
const SWISS_PHONE = /(?:\+41|0041|0)\s?\d{2}\s?\d{3}\s?\d{2}\s?\d{2}/g;

export function telHref(number: string): string {
  const digits = number.replace(/\D/g, "");
  const national = digits.startsWith("0041")
    ? digits.slice(4)
    : digits.startsWith("41")
      ? digits.slice(2)
      : digits.slice(1);
  return `tel:+41${national}`;
}

function linkPhones(line: string): ReactNode {
  const parts: ReactNode[] = [];
  let last = 0;
  for (const match of line.matchAll(SWISS_PHONE)) {
    const start = match.index;
    parts.push(line.slice(last, start));
    parts.push(
      <a key={start} href={telHref(match[0])} className="text-violet underline">
        {match[0]}
      </a>,
    );
    last = start + match[0].length;
  }
  parts.push(line.slice(last));
  return parts;
}
