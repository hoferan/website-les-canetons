import i18next from "i18next";
import { useSyncExternalStore } from "react";

import { fr } from "./fr";
import type { Locale } from "./locale";

/**
 * The catalogues in memory (#476).
 *
 * French is in the bundle: it is the default language, i18next's fallback,
 * and the language most visitors read. German is a chunk of its own, 17 KB
 * gzipped that a French page never uses. A German URL's shell starts
 * fetching it beside the bundle (vite.config.ts), and main.tsx waits for it
 * before the first render. `LocaleFromUrl` waits before rendering a German
 * URL reached by navigation, and edit mode before an editor sees its
 * controls, since a block's default carries both languages and a save
 * compares against it.
 */
const loaded: Partial<Record<Locale, typeof fr>> = { fr };

let german: Promise<void> | undefined;
const listeners = new Set<() => void>();

/** A locale's catalogue, or undefined while it is not loaded. */
export function catalogueOf(locale: Locale): typeof fr | undefined {
  return loaded[locale];
}

/**
 * Loads a locale's catalogue and hands it to i18next. The same promise on
 * every call, so React's `use` can wait on it.
 */
export function loadCatalogue(locale: Locale): Promise<void> {
  if (locale === "fr") return Promise.resolve();
  german ??= import("./de").then(({ de }) => {
    loaded["de-CH"] = de;
    i18next.addResourceBundle("de-CH", "translation", de);
    for (const listener of listeners) listener();
  });
  return german;
}

function subscribe(onChange: () => void): () => void {
  listeners.add(onChange);
  return () => listeners.delete(onChange);
}

/** Whether a locale's catalogue is in memory, rendering the caller again when it arrives. */
export function useCatalogueLoaded(locale: Locale): boolean {
  const isLoaded = () => loaded[locale] !== undefined;
  return useSyncExternalStore(subscribe, isLoaded, isLoaded);
}
