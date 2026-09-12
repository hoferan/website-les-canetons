import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { MustChangePassword } from "./components/MustChangePassword";
import { RequirePermission, RequireSession } from "./components/guards";
import { Account } from "./pages/Account";
import { Contact } from "./pages/Contact";
import { EventAttendance } from "./pages/EventAttendance";
import { EventEdit } from "./pages/EventEdit";
import { EventNew } from "./pages/EventNew";
import { EventSeriesNew } from "./pages/EventSeriesNew";
import { Events } from "./pages/Events";
import { History } from "./pages/History";
import { Join } from "./pages/Join";
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
 * THE PUBLIC PAGES SIT OUTSIDE MustChangePassword, and that is the one thing
 * about this table worth reading twice. The gate holds a member on /account
 * until they have replaced a committee-issued password — which is right for
 * the members' tool and wrong for the public site: a member in that state who
 * taps "Histoire" has no business being bounced to a password form, because
 * that page is what a stranger sees and owes nothing to who is logged in. The
 * gate still covers everything the password actually unlocks.
 *
 * Still absent, waiting on R3: /events/:id/registrations.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* THE PUBLIC FACE. No session, no gate, no guard — see the note
            above on why these sit outside MustChangePassword. */}
        <Route path="/history" element={<History />} />
        <Route path="/join" element={<Join />} />
        <Route path="/contact" element={<Contact />} />

        <Route element={<MustChangePassword />}>
          <Route path="/login" element={<Login />} />
          <Route path="/account" element={<Account />} />

          {/* Needs a SESSION and nothing more — reading the planning is
              something everybody in the band does. It still sits behind
              login: R1c is the members' tool, and a public planning is R2's
              (C1). */}
          <Route element={<RequireSession />}>
            <Route path="/events" element={<Events />} />
          </Route>

          {/* Entering the planning, which is the committee's job and nobody
              else's. The static segments are written before the dynamic one
              on purpose: React Router already ranks `/events/new` above
              `/events/:id/edit` whatever the order, and relying on that
              silently is how a route table acquires a collision nobody can
              see. */}
          <Route element={<RequirePermission permission="events.manage" />}>
            <Route path="/events/new" element={<EventNew />} />
            <Route path="/events/new/series" element={<EventSeriesNew />} />
            <Route path="/events/:id/edit" element={<EventEdit />} />
          </Route>

          {/* The chase list. A SEPARATE PERMISSION from managing events:
              seeing who has not answered and entering the planning are
              different jobs, and App\Support\Capability is what makes that
              real — this guard only mirrors it. */}
          <Route element={<RequirePermission permission="attendance.view_all" />}>
            <Route path="/events/:id/attendance" element={<EventAttendance />} />
          </Route>

          <Route element={<RequirePermission permission="members.manage" />}>
            <Route path="/members" element={<Members />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
