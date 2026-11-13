import { Check, Pencil } from "lucide-react";
import { createContext, use, useRef, useState, type ReactNode, type RefObject } from "react";
import { useLocation } from "react-router-dom";

import { Button } from "@ds";
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

/** Which button takes focus when it mounts: the one that replaced the button just pressed. */
type FocusNext = "start" | "done" | null;

type Stored = {
  available: boolean;
  stored: boolean;
  setOn: (on: boolean) => void;
  /** Turns the mode on or off from one of its buttons: announces it and hands focus over. */
  press: (on: boolean) => void;
  focusNext: RefObject<FocusNext>;
  /** What EditModeAnnouncer says: the mode just switched to. */
  announcement: string;
};

const EditModeContext = createContext<Stored>({
  available: false,
  stored: false,
  setOn: () => {},
  press: () => {},
  focusNext: { current: null },
  announcement: "",
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
  const [announcement, setAnnouncement] = useState("");
  const focusNext = useRef<FocusNext>(null);

  const setOn = (on: boolean) => {
    setStored(on);
    try {
      if (on) sessionStorage.setItem(EDIT_MODE_KEY, "1");
      else sessionStorage.removeItem(EDIT_MODE_KEY);
    } catch {
      // Remembered for this page only; see above.
    }
  };

  const press = (on: boolean) => {
    focusNext.current = on ? "done" : "start";
    setOn(on);
    setAnnouncement(t(on ? "editMode.announceOn" : "editMode.announceOff"));
  };

  return (
    <EditModeContext value={{ available, stored, setOn, press, focusNext, announcement }}>
      {children}
    </EditModeContext>
  );
}

/**
 * The polite live region that says what the mode now is, since the page change
 * is mostly silent. Its own component, mounted once by Layout, because the
 * button pressed is gone after the press: "Modifier la page" leaves the header
 * and "Terminer" leaves with the bar.
 */
export function EditModeAnnouncer() {
  const { announcement } = use(EditModeContext);
  // Only where the switch is, so no other page carries a second status region.
  if (!useSwitchShown()) {
    return null;
  }
  return (
    <div role="status" className="sr-only">
      {announcement}
    </div>
  );
}

function readStored(): boolean {
  try {
    return sessionStorage.getItem(EDIT_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Whether this account may switch the mode on this page: an editor, on a public page. */
function useSwitchShown(): boolean {
  const { available } = use(EditModeContext);
  const { pathname } = useLocation();
  return available && PUBLIC_PAGES.has(pathname);
}

/**
 * A ref that focuses the button when it mounts in place of the one just
 * pressed. The header renders the start button twice, one per breakpoint, so
 * only the copy that is displayed takes it.
 */
function useFocusOnArrival(mine: FocusNext) {
  const { focusNext } = use(EditModeContext);
  return (button: HTMLButtonElement | null) => {
    if (!button || focusNext.current !== mine) return;
    if (button.checkVisibility && !button.checkVisibility()) return;
    focusNext.current = null;
    button.focus();
  };
}

/**
 * The way into edit mode: a yellow stage button in the header, beside the
 * language switch, shown only while the mode is off. Layout places it on the
 * desktop header's top row and PhoneNav in the phone's Menu bar. It stays out
 * of the desktop nav row, which would fold its links into "Plus" to make room.
 */
export function EditModeStart({ className }: { className?: string }) {
  const { on } = useEditMode();
  const { press } = use(EditModeContext);
  const shown = useSwitchShown();
  const focusOnArrival = useFocusOnArrival("start");

  if (!shown || on) {
    return null;
  }

  return (
    <Button
      ref={focusOnArrival}
      variant="accent"
      surface="stage"
      onClick={() => press(true)}
      className={cn("border-2 px-3.5", className)}
    >
      <Pencil aria-hidden="true" />
      {t("editMode.start")}
    </Button>
  );
}

/**
 * The bar shown while edit mode is on, under the header, with the way out. It
 * sticks below the phone's Menu bar (44px) and to the top on desktop, where
 * the nav scrolls away, so "Terminer" is always in reach. Yellow under an ink
 * rule, so the page reads as being in another state.
 *
 * Anything floating over the page lies on its text as it scrolls past: a pill
 * at the bottom right covered a title or a line of card text at up to two
 * thirds of scroll positions at 390px (#417). The bar sits in the flow under
 * the header, so at the top of the page it covers nothing, and once stuck it
 * hides the page the way the header does (edit-pill.spec.ts).
 *
 * The button reads "Terminer" because "Terminer la modification" does not fit
 * beside the bar's title at 390px; its name keeps the whole phrase.
 */
export function EditModeBar() {
  const { on } = useEditMode();
  const { press } = use(EditModeContext);
  const focusOnArrival = useFocusOnArrival("done");

  if (!on) {
    return null;
  }

  return (
    <div className="sticky top-11 z-30 border-b-2 border-ink bg-yellow text-ink md:top-0">
      <div className="mx-auto flex max-w-shell items-center justify-between gap-3 px-4 py-1">
        <p className="flex items-center gap-2 font-display text-sm uppercase">
          <Pencil aria-hidden="true" className="size-4" />
          {t("editMode.bar")}
        </p>
        <Button
          ref={focusOnArrival}
          variant="secondary"
          onClick={() => press(false)}
          aria-label={t("editMode.done")}
          className="border-2"
        >
          <Check aria-hidden="true" />
          {t("editMode.end")}
        </Button>
      </div>
    </div>
  );
}
