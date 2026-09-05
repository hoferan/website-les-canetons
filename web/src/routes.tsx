import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { Login } from "./pages/Login";
import { NotFound } from "./pages/NotFound";

/**
 * The route table during the R1a rebuild.
 *
 * Deliberately almost empty: R1a replaces the foundation and deletes the old
 * domain, and R1b/R1c bring the real screens back on English URLs. Legacy
 * French paths are NOT redirected — the rebuild owes no backwards
 * compatibility (design §7).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
