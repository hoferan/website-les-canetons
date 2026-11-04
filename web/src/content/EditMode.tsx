import { Check, Pencil } from "lucide-react";
import { createContext, use, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { t } from "../i18n";
import { useSession } from "../session/SessionProvider";

/** Where the switch is remembered, for this tab only. */
export const EDIT_MODE_KEY = "canetons.editMode";

/**
 * The pages a visitor reads, the only ones with something to change in
 * place. Paths as useLocation() gives them, with the locale prefix removed.
 */
const PUBLIC_PAGES = new Set([
  "/",
  "/agenda",
  "/band",
  "/committee",
  "/history",
  "/join",
  "/contact",
]);

type EditMode = {
  /** Whether this account may change anything on a page: blocks or photos. */
  available: boolean;
  /** Whether the page shows its edit controls. Never true when not available, nor off the public pages. */
  on: boolean;
  setOn: (on: boolean) => void;
};

type Stored = { available: boolean; stored: boolean; setOn: (on: boolean) => void };

const EditModeContext = createContext<Stored>({
  available: false,
  stored: false,
  setOn: () => {},
});

/**
 * Whether the page shows its edit controls. The public-page check lives here,
 * not in the provider: the provider sits above the router in main.tsx, while
 * every consumer of this hook renders inside it. The switch stays stored, so
 * it is on again when the editor comes back to a public page.
 */
export function useEditMode(): EditMode {
  const { available, stored, setOn } = use(EditModeContext);
  const { pathname } = useLocation();
  return { available, on: available && stored && PUBLIC_PAGES.has(pathname), setOn };
}

/**
 * One switch for every edit control on the public pages, blocks and photos
 * alike (#106). Off, an editor sees a page exactly as a visitor does, which is
 * how they check what they changed; on, each block and photo they may change
 * carries its edit button, and each still asks for its own permission.
 *
 * Remembered per tab in sessionStorage, so a reload keeps it but a new tab
 * starts as a visitor would see the site. Storage that throws (a private
 * window, blocked site data) only loses the memory.
 */
export function EditModeProvider({ children }: { children: ReactNode }) {
  const { can } = useSession();
  const available = can("content.manage") || can("images.manage");
  const [stored, setStored] = useState(readStored);

  const setOn = (on: boolean) => {
    setStored(on);
    try {
      if (on) sessionStorage.setItem(EDIT_MODE_KEY, "1");
      else sessionStorage.removeItem(EDIT_MODE_KEY);
    } catch {
      // Remembered for this page only; see above.
    }
  };

  return <EditModeContext value={{ available, stored, setOn }}>{children}</EditModeContext>;
}

function readStored(): boolean {
  try {
    return sessionStorage.getItem(EDIT_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * Whether the floating pill is shown: an editor, on a public page. Layout uses
 * it to keep the pill clear of the footer.
 */
export function useEditPillShown(): boolean {
  const { available } = use(EditModeContext);
  const { pathname } = useLocation();
  return available && PUBLIC_PAGES.has(pathname);
}

/**
 * The switch itself: a pill fixed at the bottom right of every public page an
 * editor may change, ink in both states. It is one element whose
 * label changes, so focus stays on it after a toggle; a polite live region
 * says what the mode now is, since the page change is mostly silent.
 */
export function EditModePill() {
  const { on, setOn } = useEditMode();
  const shown = useEditPillShown();
  const [announcement, setAnnouncement] = useState("");

  if (!shown) {
    return null;
  }

  const toggle = () => {
    setOn(!on);
    setAnnouncement(t(on ? "editMode.announceOff" : "editMode.announceOn"));
  };

  return (
    <>
      <Button
        onClick={toggle}
        className={cn(
          "fixed right-4 z-40 px-5",
          "bottom-[max(1rem,env(safe-area-inset-bottom))]",
          // Ink with a white ring reads on the yellow band, the cream, the
          // violet hero and the footer alike; yellow or white vanished on one
          // of them.
          "bg-ink text-white ring-2 shadow-raised ring-white hover:bg-ink-hover",
        )}
      >
        {on ? <Check aria-hidden="true" /> : <Pencil aria-hidden="true" />}
        {on ? t("editMode.done") : t("editMode.start")}
      </Button>
      <div role="status" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
