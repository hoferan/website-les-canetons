import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { MustChangePassword } from "./components/MustChangePassword";
import { RequirePermission } from "./components/guards";
import { Account } from "./pages/Account";
import { Login } from "./pages/Login";
import { Members } from "./pages/Members";
import { NotFound } from "./pages/NotFound";

/**
 * The route table after R1b.
 *
 * URLs ARE RESOURCE-ORIENTED, and there is deliberately no `/admin` or
 * `/manage` namespace: under real RBAC there is no single privileged area —
 * `events.manage` and `members.manage` are different people — and a namespace
 * named after a permission level is a lie about the model (design §4). The nav
 * still groups Direction screens under one heading; nav grouping and URL
 * structure are different problems, and only one of them has to encode
 * authorization.
 *
 * MustChangePassword wraps everything INSIDE the layout: a committee-issued
 * password must be replaced before any other screen is usable, and the gate has
 * to see the pathname to exempt /account from its own redirect. `/login` sits
 * inside it on purpose — a member who must change their password and navigates
 * there is already logged in, so sending them to /account is right. It cannot
 * trap anyone, because logging out is a button in the chrome rather than a
 * route.
 *
 * Legacy French paths are NOT redirected — the rebuild owes no backwards
 * compatibility (design §7/D11) — so they fall through to the 404 view like
 * every other unknown path.
 *
 * Still absent, each waiting on its own release: /events and its children
 * (R1c), /band, /committee, /join, /history (R2), /events/:id/registrations
 * (R3).
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route element={<MustChangePassword />}>
          <Route path="/login" element={<Login />} />
          <Route path="/account" element={<Account />} />

          <Route element={<RequirePermission permission="members.manage" />}>
            <Route path="/members" element={<Members />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
