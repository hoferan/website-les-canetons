import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App, { createAppRouter } from "./App";
import { applyDocumentMeta } from "./i18n/documentMeta";
import { htmlLang, localeFromPath, pathInLocale } from "./i18n/locale";
import { shouldRedirectToGerman, storedLocale } from "./i18n/preference";
import { SessionProvider } from "./session/SessionProvider";
import "./styles.css";

// The mocked backend, opted into with `npm run dev:mock`. Guarded on
// import.meta.env.DEV as well, so the worker never starts in a built bundle
// even if VITE_MOCK_API leaked into a production environment.
//
// Awaited before the first render, or the boot gate's GET /api/config races
// it and sometimes reaches the network.
if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === "1") {
  const { worker } = await import("./mocks/browser");
  // bypass, because Vite's own module and HMR requests must pass through.
  await worker.start({ onUnhandledRequest: "bypass" });
}

// The one place a stored preference is read, and only for the bare root;
// everywhere else the URL decides. Replace rather than assign, so the French
// root does not sit in the back-stack. It cannot loop: /de is not "/".
const redirecting = shouldRedirectToGerman(window.location.pathname, storedLocale());

if (redirecting) {
  window.location.replace(
    `${pathInLocale("/", "de-CH")}${window.location.search}${window.location.hash}`,
  );
} else {
  // In an `else` because location.replace() schedules a navigation without
  // stopping this script. Falling through would mount the French app, boot
  // requests included, and flash the wrong language. A module has no
  // top-level `return`.
  const { locale, basename } = localeFromPath(window.location.pathname);

  // The shell ships <html lang="fr"> for a crawler that runs no JavaScript.
  // This corrects it for the German mount; a screen reader picks its voice
  // from it.
  document.documentElement.lang = htmlLang(locale);

  // The rest of the shell's <head>, since one static document serves every
  // path. What it leaves alone, and why, is in i18n/documentMeta.ts.
  applyDocumentMeta(locale);

  const root = document.getElementById("root");
  if (!root) {
    throw new Error("web/index.html is missing #root — the shell cannot mount.");
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // A members' page left open in a background tab would otherwise
        // refetch everything on every focus.
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createAppRouter(basename);

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <App router={router} />
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
