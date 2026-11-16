// What a hero and its editor both name. Apart from the editor, which is
// loaded in edit mode only (#396), so neither imports the other.

import type { BLOCKS, BlockKey } from "../registry";
import type { heroBlock } from "../types";

/** The blocks that are a page's hero. */
export type HeroKey = {
  [K in BlockKey]: (typeof BLOCKS)[K]["schema"] extends typeof heroBlock ? K : never;
}[BlockKey];
