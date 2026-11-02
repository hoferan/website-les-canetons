import { Check, Pencil } from "lucide-react";
import { createContext, use, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";

import { Button } from "@/components/ui/button";

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
  /** Whether this account may change anything on a page: texts or photos. */
  available: boolean;
  /** Whether the page shows its pencils. Never true when not available. */
  on: boolean;
  setOn: (on: boolean) => void;
};

const EditModeContext = createContext<EditMode>({ available: false, on: false, setOn: () => {} });

export function useEditMode(): EditMode {
  return use(EditModeContext);
}

/**
 * One switch for every pencil on the public pages, texts and photos alike
 * (#106). Off, an editor sees a page exactly as a visitor does, which is how
 * they check what they changed; on, each text and photo they may change
 * carries its pencil, and each still asks for its own permission.
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

  return (
    <EditModeContext value={{ available, on: available && stored, setOn }}>
      {children}
    </EditModeContext>
  );
}

function readStored(): boolean {
  try {
    return sessionStorage.getItem(EDIT_MODE_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * The switch itself, under the nav of a public page: a small "Modifier la
 * page" while off, a yellow band saying what the mode is while on. One control
 * for the phone and the desktop alike, and only where there is something to
 * change.
 */
export function EditModeBar() {
  const { available, on, setOn } = useEditMode();
  const { pathname } = useLocation();

  if (!available || !PUBLIC_PAGES.has(pathname)) {
    return null;
  }

  if (!on) {
    return (
      <div className="mx-auto flex max-w-shell justify-end px-4 pt-3">
        <Button variant="raised-light" size="sm" onClick={() => setOn(true)}>
          <Pencil aria-hidden="true" />
          {t("editMode.start")}
        </Button>
      </div>
    );
  }

  return (
    <section aria-label={t("editMode.region")} className="border-b-3 border-ink bg-yellow">
      <div className="mx-auto flex max-w-shell flex-wrap items-center justify-between gap-3 px-4 py-3">
        <p className="text-sm font-semibold text-ink">{t("editMode.hint")}</p>
        <Button variant="raised-light" size="sm" onClick={() => setOn(false)}>
          <Check aria-hidden="true" />
          {t("editMode.done")}
        </Button>
      </div>
    </section>
  );
}
