import { Check, Pencil } from "lucide-react";
import { createContext, use, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { Button } from "@ds";

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
  // history.manage too: the history page's controls show in edit mode, and
  // blocks and photos still ask for their own permission.
  const available = can("content.manage") || can("images.manage") || can("history.manage");
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
 * The switch itself, in a bar docked to the bottom of every public page an
 * editor may change. It is one element whose label changes, so focus stays on
 * it after a toggle; a polite live region says what the mode now is, since the
 * page change is mostly silent.
 *
 * Anything floating over the page lies on its text as it scrolls past: a pill
 * at the bottom right covered a title or a line of card text at up to two
 * thirds of scroll positions at 390px (#417). The opaque bar hides the page the
 * way the screen's edge does, so scrolling brings every line into view, and
 * the footer pads its end past the bar so the last line clears it too
 * (edit-pill.spec.ts).
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
      {/* On the stage like the footer and the phone's Menu bar, so the button
          takes the stage's look: yellow, with the pink offset shadow. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-stage pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mx-auto flex max-w-shell justify-end px-4">
          <Button variant="accent" surface="stage" onClick={toggle} className="px-5">
            {on ? <Check aria-hidden="true" /> : <Pencil aria-hidden="true" />}
            {on ? t("editMode.done") : t("editMode.start")}
          </Button>
        </div>
      </div>
      <div role="status" className="sr-only">
        {announcement}
      </div>
    </>
  );
}
