import { Fragment, type ReactNode } from "react";

import { styledRuns } from "./inlineStyles";

/**
 * A block's text with its bold and italic words (`inlineStyles.ts`), as React
 * elements: no HTML string is ever built from what an editor typed.
 *
 * The line breaks stay in the text, so a `whitespace-pre-line` paragraph still
 * breaks where the band did. Bold and italic together are an `<em>` inside a
 * `<strong>`.
 */
export function StyledText({ text }: { text: string }) {
  return text.split("\n").map((line, lineIndex) => (
    <Fragment key={lineIndex}>
      {lineIndex > 0 ? "\n" : null}
      {styledRuns(line).map((run, index) => {
        let shown: ReactNode = run.text;
        if (run.italic) shown = <em>{shown}</em>;
        if (run.bold) shown = <strong>{shown}</strong>;
        return <Fragment key={index}>{shown}</Fragment>;
      })}
    </Fragment>
  ));
}
