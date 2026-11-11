import { createContext, useContext, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** The place in a block editor's header that its fields' menu goes to. */
export const EditorHeaderSlot = createContext<HTMLElement | null>(null);

/**
 * A menu of actions on what the editor shows, such as Dupliquer and Supprimer
 * for a card, placed in the editor's header beside FR | DE (ADR 0043). It is
 * rendered by the fields, which own the actions, and shows in the header,
 * which stays in view while the fields scroll. The editor must be opened with
 * `menu`, so that its header leaves room for it on a phone.
 */
export function EditorMenu({ children }: { children: ReactNode }) {
  const slot = useContext(EditorHeaderSlot);
  return slot ? createPortal(children, slot) : null;
}
