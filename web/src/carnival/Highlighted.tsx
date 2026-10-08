/**
 * A sentence with a few of its words on the yellow highlight.
 *
 * The words come from their own catalogue key, so each language picks its own:
 * "guggen d’enfants" in French, "Kinder-Guggenmusik" in German, where the word
 * order differs. If a translation stops containing them, the sentence renders plain.
 *
 * A HEADING THAT CARRIES IT NEEDS LEADING OF 1.18 OR MORE. At the 1.0 that
 * text-5xl sets, the box sat flush on the line below and read as a label stuck
 * onto the sentence. `bg-highlight` in styles.css trims the yellow to the
 * capitals, and the top padding centres them in it.
 */
export function Highlighted({ text, mark }: { text: string; mark: string }) {
  const at = mark === "" ? -1 : text.indexOf(mark);
  if (at === -1) {
    return text;
  }

  return (
    <>
      {text.slice(0, at)}
      <span className="bg-highlight box-decoration-clone px-[0.14em] pt-[0.02em] text-ink">
        {mark}
      </span>
      {text.slice(at + mark.length)}
    </>
  );
}
