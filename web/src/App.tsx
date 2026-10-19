import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { LeaveGuardProvider } from "./components/LeaveGuard";
import { AppRoutes } from "./routes";

/**
 * The app's router, created once by the caller and handed to <App>.
 *
 * A data router, because `useBlocker` works under nothing else, and the leave
 * guards need it to catch Back and `navigate()` as well as a link. The route
 * table stays a <Routes> tree in routes.tsx under one splat route: nothing
 * here uses loaders or actions, the only things descendant <Routes> miss.
 *
 * `basename` makes the locale prefix free at the call sites: <Link
 * to="/agenda"> resolves under it, and useLocation() returns the pathname
 * with it stripped, so guards comparing to a literal ("/account" in
 * MustChangePassword) keep matching.
 *
 * The caller derives it from the URL; it is never hardcoded. React Router
 * renders nothing when the URL does not begin with the basename, so a literal
 * "/de" would break jsdom tests and Playwright alike. French is unprefixed.
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
            <AppRoutes />
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
