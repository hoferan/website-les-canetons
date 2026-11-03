import { useSession } from "../../session/SessionProvider";
import { useEditMode } from "../EditMode";

/**
 * Whether the page shows a block's edit chip: edit mode is on, and this
 * account may change the texts. Edit mode alone is not enough, since it is
 * also on for an account that may change only the photos.
 */
export function useBlockEditing(): boolean {
  const { on } = useEditMode();
  const { can } = useSession();
  return on && can("content.manage");
}
