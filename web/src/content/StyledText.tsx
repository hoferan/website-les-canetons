import { Fragment, type ReactNode } from "react";

import { styledRuns } from "./inlineStyles";

/**
 * A block's text with its bold and italic words (`inlineStyles.ts`), as React
 * elements: no HTML string is ever built from what an editor typed.
 *
 * The line breaks stay in the text, so a `whitespace-pre-line` paragraph still
 * breaks where the band did. Bold and italic together are an `<em>` inside a
 * `<strong>`. `boldClassName` styles the bold words where the text around
 * them is tinted, such as the footer's muted pitch.
 */
export function StyledText({ text, boldClassName }: { text: string; boldClassName?: string }) {
  return text.split("\n").map((line, lineIndex) => (
    <Fragment key={lineIndex}>
      {lineIndex > 0 ? "\n" : null}
      {styledRuns(line).map((run, index) => {
        let shown: ReactNode = run.text;
        if (run.italic) shown = <em>{shown}</em>;
        if (run.bold) shown = <strong className={boldClassName}>{shown}</strong>;
        return <Fragment key={index}>{shown}</Fragment>;
      })}
    </Fragment>
  ));
}
