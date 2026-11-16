// What a grid of cards and its editor both name. Apart from the editor,
// which is loaded in edit mode only (#396), so neither imports the other.

import type { BLOCKS, BlockData, BlockKey } from "../registry";
import type { cardsBlock } from "../types";

/** The blocks that are a grid of cards. */
export type CardsKey = {
  [K in BlockKey]: (typeof BLOCKS)[K]["schema"] extends typeof cardsBlock ? K : never;
}[BlockKey];

export type CardsData = BlockData<CardsKey>;

/**
 * The card the editor shows, by id: a card being added has no place in the
 * list until the editor appends it. A copy made in the editor knows the
 * title of the card it copies, which its heading names.
 */
export type Opened = { id: string; adding: boolean; copyOf?: string };

/** What a card is found by while its editor is open (`BlockEditor`'s `target`). */
export const cardEditTarget = (blockKey: CardsKey, cardId: string) => `${blockKey}/${cardId}`;
