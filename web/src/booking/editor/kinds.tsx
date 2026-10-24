import {
  CircleDot,
  Hash,
  Heading,
  MessageSquareText,
  Pilcrow,
  ToggleLeft,
  type LucideIcon,
} from "lucide-react";

import type { OptionKind } from "../../api/generated/model";
import { t } from "../../i18n";

/**
 * Each kind's sticker: the same colour and icon on a closed block, an open
 * one and in the picker, so a committee member recognises a kind before
 * reading its name. Tints from the carnival palette (ADR 0029).
 */
const STICKERS: Record<OptionKind, { tint: string; Icon: LucideIcon }> = {
  quantity: { tint: "bg-yellow", Icon: Hash },
  choice: { tint: "bg-lilac", Icon: CircleDot },
  yes_no: { tint: "bg-lime", Icon: ToggleLeft },
  text: { tint: "bg-cyan", Icon: MessageSquareText },
  heading: { tint: "bg-pink", Icon: Heading },
  paragraph: { tint: "bg-pink", Icon: Pilcrow },
};

/** The kind's sticker, tilted over the top edge of its block. */
export function KindSticker({ kind }: { kind: OptionKind }) {
  const { tint, Icon } = STICKERS[kind];

  return (
    <span
      className={`absolute -top-3.5 left-5 inline-flex -rotate-2 items-center gap-1 rounded-full border-2 border-ink px-2.5 py-0.5 text-sm font-semibold ${tint}`}
    >
      <Icon aria-hidden="true" className="size-3.5" />
      {t(`registrationOptions.kinds.${kind}`)}
    </span>
  );
}

/** The kind's icon on its own tile, for the picker. */
export function KindTile({ kind }: { kind: OptionKind }) {
  const { tint, Icon } = STICKERS[kind];

  return (
    <span
      aria-hidden="true"
      className={`inline-flex size-8 shrink-0 items-center justify-center rounded-md border-2 border-ink ${tint}`}
    >
      <Icon className="size-4" />
    </span>
  );
}
