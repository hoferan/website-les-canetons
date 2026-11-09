import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { LeaveGuardProvider } from "./components/LeaveGuard";
import { LocaleFromUrl } from "./i18n/routing";
import { AppRoutes } from "./routes";

/**
 * The app's router, created once by the caller and handed to <App>.
 *
 * A data router, because `useBlocker` works under nothing else, and the leave
 * guards need it to catch Back and `navigate()` as well as a link. The route
 * table stays a <Routes> tree in routes.tsx under one splat route: nothing
 * here uses loaders or actions, the only things descendant <Routes> miss.
 *
 * `basename` is where the app is served, the same for both languages: the
 * root, or a PR preview's subpath. `LocaleFromUrl` reads the language from
 * the rest of the path and hands the route table that path without it, so
 * changing language is a navigation like any other and keeps the page
 * mounted (#369).
 *
 * The caller creates it once, outside React. A browser router listens to the
 * history as soon as it exists, and StrictMode runs a state initialiser twice,
 * which would leave a second router listening.
 */
export function createAppRouter(basename = "/") {
  return createBrowserRouter(
    [
      {
        path: "*",
        element: (
          <LeaveGuardProvider>
            <LocaleFromUrl>
              <AppRoutes />
            </LocaleFromUrl>
          </LeaveGuardProvider>
        ),
      },
    ],
    { basename },
  );
}

export default function App({ router }: { router: ReturnType<typeof createAppRouter> }) {
  return <RouterProvider router={router} />;
}
