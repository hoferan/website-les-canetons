import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
import { applyDocumentMeta } from "./i18n/documentMeta";
import { htmlLang, localeFromPath, pathInLocale } from "./i18n/locale";
import { shouldRedirectToGerman, storedLocale } from "./i18n/preference";
import { SessionProvider } from "./session/SessionProvider";
import "./styles.css";

// The mocked backend, opt in per run with `npm run dev:mock`. Guarded on
// import.meta.env.DEV as well as the flag, so the worker can never start in a
// built bundle even if VITE_MOCK_API leaked into a production environment.
//
// Awaited before the first render: starting it afterwards races the boot gate's
// GET /api/config, which would then sometimes reach the network instead.
if (import.meta.env.DEV && import.meta.env.VITE_MOCK_API === "1") {
  const { worker } = await import("./mocks/browser");
  // bypass, not error: Vite's own module and HMR requests are unhandled by
  // design and must pass through untouched.
  await worker.start({ onUnhandledRequest: "bypass" });
}

// THE ONE PLACE A STORED PREFERENCE IS READ, and only for the bare root.
// Everywhere else the URL is the authority. Replace rather than assign, so the
// French root does not sit in the back-stack as a place to return to.
//
// This cannot loop: /de resolves to German and its pathname is no longer "/".
const redirecting = shouldRedirectToGerman(window.location.pathname, storedLocale());

if (redirecting) {
  window.location.replace(
    `${pathInLocale("/", "de-CH")}${window.location.search}${window.location.hash}`,
  );
} else {
  // EVERYTHING BELOW IS IN AN `else`, AND THAT IS THE POINT. location.replace()
  // schedules a navigation; it does not stop this script. Falling through would
  // mount the whole French app -- SessionProvider's boot requests included --
  // for the one visitor we have just decided to send to German, and race the
  // navigation with a flash of the wrong language. A top-level `return` is not
  // available in a module, so the boot is nested instead.
  const { locale, basename } = localeFromPath(window.location.pathname);

  // The shell ships <html lang="fr">, which is right for the majority and for a
  // crawler that runs no JavaScript. This corrects it for the German mount, and
  // is what a screen reader picks its voice from.
  document.documentElement.lang = htmlLang(locale);

  // The rest of the shell's <head>, corrected the same way and for the same
  // reason: one static document serves every path. What it deliberately does
  // NOT touch, and why, is in i18n/documentMeta.ts.
  applyDocumentMeta(locale);

  const root = document.getElementById("root");
  if (!root) {
    throw new Error("web/index.html is missing #root — the shell cannot mount.");
  }

  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // The API is same-origin and cheap, but a members' page left open in a
        // background tab would otherwise refetch everything on every focus.
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <App basename={basename} />
        </SessionProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
