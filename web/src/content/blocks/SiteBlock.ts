import { useBlock } from "../BlocksProvider";
import type { BlockData } from "../registry";

/**
 * What the header and the footer of every page show: the band's name, the
 * line under it, the legal name and the networks. Shipped content outside
 * BlocksProvider, as every block is.
 */
export function useSite(): BlockData<"site"> {
  return useBlock("site");
}
