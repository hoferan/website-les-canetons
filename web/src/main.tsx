import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App";
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
        <App />
      </SessionProvider>
    </QueryClientProvider>
  </StrictMode>,
);
