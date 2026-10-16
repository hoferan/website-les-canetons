import { RouterProvider, createBrowserRouter } from "react-router-dom";

import { LeaveGuardProvider } from "./components/LeaveGuard";
import { AppRoutes } from "./routes";

/**
 * The app's router, created once by the caller and handed to <App>.
 *
 * A DATA ROUTER, because `useBlocker` works under nothing else, and the leave
 * guards need it to catch Back and `navigate()` as well as a link (#232). The
 * route table itself stays a <Routes> tree in routes.tsx, mounted under one
 * splat route: descendant <Routes> work under a data router, and nothing here
 * uses loaders or actions, which are the only things they would miss.
 *
 * `basename` is what makes the locale prefix cost nothing at the call sites.
 * Every existing <Link to="/agenda"> and navigate("/events") resolves under it
 * automatically, and useLocation() hands back a pathname with it already
 * stripped, so the guards that compare a pathname to a literal ("/account" in
 * MustChangePassword) keep matching without being touched.
 *
 * DERIVED FROM THE URL BY THE CALLER, never hardcoded. A literal "/de" here
 * would break every test that renders <App /> in jsdom (document URL
 * "http://localhost/") and all nine Playwright page.goto() call sites, because
 * React Router renders nothing when the URL does not begin with the basename.
 * French is unprefixed, so passing "/" is the status quo.
 *
 * The caller creates it once, outside React. A browser router starts listening
 * to the history as soon as it exists, and StrictMode runs a component's state
 * initialiser twice, which would leave a second router listening.
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
