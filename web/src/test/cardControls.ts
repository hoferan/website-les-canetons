/**
 * Names of a card's controls on its action strip (ADR 0043), for tests that
 * find them by title. Every name also carries the card's place, "carte 2 sur
 * 5", which changes as cards move, so these match any place.
 */

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** A card's ✎. It ends in "(sans allemand)" exactly when `title` does. */
export function cardPencil(title: string) {
  const german = " (sans allemand)";
  const bare = title.endsWith(german) ? title.slice(0, -german.length) : title;
  const tail = title.endsWith(german) ? escaped(german) : "";
  return new RegExp(`^Modifier : ${escaped(bare)}, carte \\d+ sur \\d+${tail}$`);
}

/** A card's move arrow. */
export function cardArrow(title: string, direction: "avant" | "après") {
  return new RegExp(`^Déplacer « ${escaped(title)}, carte \\d+ sur \\d+ » ${direction}$`);
}
