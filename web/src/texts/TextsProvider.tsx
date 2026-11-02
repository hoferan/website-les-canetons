import { createContext, use, useEffect, useState, type ReactNode } from "react";

import { rowsOf } from "../api/collection";
import { useTextIndex } from "../api/generated/endpoints";
import type { TextOverrideResource } from "../api/generated/model";
import { currentLocale } from "../i18n";
import { applyDocumentMeta } from "../i18n/documentMeta";
import { applyOverrides } from "../i18n/overrides";

/**
 * Changes every time the stored texts do. A component that renders a text the
 * band can change reads it, so it renders again after a save; `t()` itself is
 * a plain function and would not.
 */
const TextsVersion = createContext(0);

/**
 * How long the first paint waits for the texts. Past it the page renders in
 * the catalogue wording, and the band's arrives with a re-render: a slow
 * server costs a flash at worst, never a blank page.
 */
const TEXTS_WAIT_MS = 1500;

export function useTextsVersion(): number {
  return use(TextsVersion);
}

/**
 * The band's texts, written over the catalogue before anything renders.
 *
 * Children wait for them, briefly: a first paint in the catalogue wording
 * would flash and then change. A failed or slow read is not a failed boot,
 * though. Every text has its catalogue wording to fall back on, so the site
 * renders with that and the failure goes to the console.
 *
 * It needs no session, so main.tsx puts it above SessionProvider and the
 * texts are read beside the config and the session, not after them.
 *
 * Applied during render rather than in an effect, so the children of that
 * same render already see them. It is idempotent, and StrictMode's second
 * render writes the same values again.
 */
export function TextsProvider({ children }: { children: ReactNode }) {
  const texts = useTextIndex(undefined, { query: { retry: false, staleTime: Infinity } });
  const [waitedEnough, setWaitedEnough] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setWaitedEnough(true), TEXTS_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  if (texts.isSuccess) {
    applyOverrides(rowsOf<TextOverrideResource>(texts.data));
  }

  useEffect(() => {
    if (texts.isError) {
      console.error("Reading the site's texts failed; showing the defaults.", texts.error);
    }
  }, [texts.isError, texts.error]);

  // The title and description are set before the boot gate, in the
  // catalogue wording; this puts the band's version in once it is known.
  useEffect(() => {
    if (texts.isSuccess) {
      applyDocumentMeta(currentLocale());
    }
  }, [texts.isSuccess, texts.dataUpdatedAt]);

  if (texts.isPending && !waitedEnough) {
    return null;
  }

  return <TextsVersion value={texts.dataUpdatedAt}>{children}</TextsVersion>;
}
