import { BrowserRouter } from "react-router-dom";

import { AppRoutes } from "./routes";

/**
 * `basename` is what makes the locale prefix cost nothing at the call sites.
 *
 * Every existing <Link to="/agenda"> and navigate("/events") resolves under it
 * automatically, and useLocation() hands back a pathname with it already
 * stripped — so the guards that compare a pathname to a literal ("/account" in
 * MustChangePassword) keep matching without being touched.
 *
 * DERIVED FROM THE URL BY THE CALLER, never hardcoded. A literal "/de" here
 * would break every test that renders <App /> in jsdom (document URL
 * "http://localhost/") and all nine Playwright page.goto() call sites, because
 * React Router renders nothing when the URL does not begin with the basename.
 * French is unprefixed, so passing "/" is the status quo.
 */
export default function App({ basename = "/" }: { basename?: string }) {
  return (
    <BrowserRouter basename={basename}>
      <AppRoutes />
    </BrowserRouter>
  );
}
