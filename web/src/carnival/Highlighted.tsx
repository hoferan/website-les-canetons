/**
 * A sentence with a few of its words on the yellow highlight.
 *
 * The words come from their own catalogue key, so each language picks its own:
 * "d’enfants" in French, "Kinder-Guggenmusik" in German, where the word order
 * differs. If a translation stops containing them, the sentence renders plain.
 */
export function Highlighted({ text, mark }: { text: string; mark: string }) {
  const at = mark === "" ? -1 : text.indexOf(mark);
  if (at === -1) {
    return text;
  }

  return (
    <>
      {text.slice(0, at)}
      <span className="bg-yellow box-decoration-clone px-[0.14em] text-ink">{mark}</span>
      {text.slice(at + mark.length)}
    </>
  );
}
