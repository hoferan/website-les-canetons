import { useSession } from "../../session/SessionProvider";
import { useBlockPreviewing } from "../BlocksProvider";
import { useEditMode } from "../EditMode";

/**
 * Whether the page shows a block's edit chip: edit mode is on, and this
 * account may change the texts. Edit mode alone is not enough, since it is
 * also on for an account that may change only the photos.
 *
 * While a block's editor is open the page is its preview (#357), so the chips
 * go: what shows is what a visitor would see. A block whose editor is open
 * keeps it mounted with `editing || open`, since this turns false under it.
 */
export function useBlockEditing(): boolean {
  const { on } = useEditMode();
  const { can } = useSession();
  const previewing = useBlockPreviewing();
  return on && can("content.manage") && !previewing;
}
