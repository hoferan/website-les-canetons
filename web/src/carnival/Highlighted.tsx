import { markRange } from "../content/editor/markTokens";

/**
 * A sentence with a few of its words on the yellow highlight.
 *
 * The words come from their own catalogue key, so each language picks its own:
 * "guggen d’enfants" in French, "Kinder-Guggenmusik" in German, where the word
 * order differs. If a translation stops containing them as whole words, the sentence
 * renders plain: the first occurrence that starts and ends on a word is lit,
 * the one the editor's word picker shows.
 *
 * A heading that carries it needs leading of 1.18 or more. At the 1.0 that
 * text-5xl sets, the box sits flush on the line below and reads as a label
 * stuck onto the sentence. `bg-highlight` in styles.css trims the yellow to
 * the capitals, and the top padding centres them in it.
 */
export function Highlighted({ text, mark }: { text: string; mark: string }) {
  const range = markRange(text, mark);
  if (range === null) {
    return text;
  }

  return (
    <>
      {text.slice(0, range.start)}
      <span className="bg-highlight box-decoration-clone px-[0.14em] pt-[0.02em] text-ink">
        {text.slice(range.start, range.end)}
      </span>
      {text.slice(range.end)}
    </>
  );
}
