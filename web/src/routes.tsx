import { lazy, Suspense } from "react";
import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { MustChangePassword } from "./components/MustChangePassword";
import { RequirePermission } from "./components/guards";
import { Account } from "./pages/Account";
import { AccountPassword } from "./pages/AccountPassword";
import { Agenda } from "./pages/Agenda";
import { Band } from "./pages/Band";
import { Committee } from "./pages/Committee";
import { Contact } from "./pages/Contact";
import { ContactMessages } from "./pages/ContactMessages";
import { EventAttendance } from "./pages/EventAttendance";
import { EventBooking } from "./pages/EventBooking";
import { EventEdit } from "./pages/EventEdit";
import { EventNew } from "./pages/EventNew";
import { EventRegistrationOptions } from "./pages/EventRegistrationOptions";
import { EventRegistrations } from "./pages/EventRegistrations";
import { EventSeriesNew } from "./pages/EventSeriesNew";
import { EventTags } from "./pages/EventTags";
import { Events } from "./pages/Events";
import { History } from "./pages/History";
import { HistoryEdit } from "./pages/HistoryEdit";
import { HistoryNew } from "./pages/HistoryNew";
import { Home } from "./pages/Home";
import { Inbox } from "./pages/Inbox";
import { Join } from "./pages/Join";
import { Login } from "./pages/Login";
import { Registers } from "./pages/Registers";
import { Roles } from "./pages/Roles";
import { Members } from "./pages/Members";
import { NotFound } from "./pages/NotFound";

// The library's two pages are a chunk of their own: only `images.manage` opens
// them, and they bring the upload queue and the shrink step. A navigation here
// is a transition, so the previous page stays up while the chunk loads; only a
// fresh load of the URL shows the empty fallback.
const Media = lazy(() => import("./pages/Media").then((module) => ({ default: module.Media })));
const MediaDetail = lazy(() =>
  import("./pages/MediaDetail").then((module) => ({ default: module.MediaDetail })),
);

/**
 * The route table.
 *
 * URLs are resource-oriented, with no `/admin` or `/manage` namespace:
 * `events.manage` and `members.manage` are different people, so there is no
 * single privileged area to name (ADR 0014). The nav may still group screens;
 * only the URL would encode authorization. `/events/:id/book`,
 * `/events/:id/registrations` and `/events/:id/registration-options` share a
 * prefix and answer to three different guards.
 *
 * MustChangePassword wraps the members' routes inside the layout: a
 * committee-issued password must be replaced before any of them is usable,
 * and the gate sees the pathname to exempt /account/password. `/login` sits
 * inside it because a member in that state is already logged in. It cannot
 * trap anyone, because logging out is a button in the chrome.
 *
 * The public pages sit outside MustChangePassword: they are what a stranger
 * sees, so a member in that state who taps "Histoire" is not bounced to a
 * password form.
 *
 * Legacy French paths are not redirected (ADR 0003); they get the 404 view
 * like every other unknown path.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* The public pages: no session, no gate, no guard. */}
        <Route index element={<Home />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/band" element={<Band />} />
        <Route path="/committee" element={<Committee />} />
        <Route path="/history" element={<History />} />
        <Route path="/join" element={<Join />} />
        <Route path="/contact" element={<Contact />} />

        {/* The booking form is public under a path whose other segments are
            not: registration is a property of an event (ADR 0020). Nothing
            leaks, because the endpoint answers 404 for an event that takes no
            bookings, whether or not it exists.

            `book`, not `register`: a register is a pupitre ("Trompettes"),
            so /events/:id/register would read as a section's page. */}
        <Route path="/events/:id/book" element={<EventBooking />} />

        <Route element={<MustChangePassword />}>
          <Route path="/login" element={<Login />} />

          {/* One's own account. `account.manage` is the permission
              POST /api/v1/me/password checks, and every account holds it
              through the baseline role, so in practice this is "logged in". */}
          <Route element={<RequirePermission permission="account.manage" />}>
            <Route path="/account" element={<Account />} />
            <Route path="/account/password" element={<AccountPassword />} />
          </Route>

          {/* The baseline role grants `events.view` to every account, but
              the planning still sits behind login; the public agenda is a
              separate page. */}
          <Route element={<RequirePermission permission="events.view" />}>
            <Route path="/events" element={<Events />} />
          </Route>

          {/* Static segments come before the dynamic one. React Router ranks
              them correctly in any order, but the order shows it. */}
          <Route element={<RequirePermission permission="events.manage" />}>
            <Route path="/events/new" element={<EventNew />} />
            <Route path="/events/new/series" element={<EventSeriesNew />} />
            <Route path="/events/:id/edit" element={<EventEdit />} />

            {/* What the event offers is part of the event, hence
                `events.manage`. It writes on its own entity-tag facet,
                `event.options`, so a dress code fix cannot refuse a pending
                options edit and an option change cannot slip past one. */}
            <Route path="/events/:id/registration-options" element={<EventRegistrationOptions />} />

            {/* The tag list. Picking an event's tags is in the event's form. */}
            <Route path="/event-tags" element={<EventTags />} />
          </Route>

          {/* The chase list. Seeing who has not answered and entering the
              planning are different jobs, so a separate permission. */}
          <Route element={<RequirePermission permission="attendance.view_all" />}>
            <Route path="/events/:id/attendance" element={<EventAttendance />} />
          </Route>

          {/* The guest list, guarded on `registrations.view` alone, which the
              `committee` role holds. The amend and cancel controls inside
              answer to `registrations.manage`. */}
          <Route element={<RequirePermission permission="registrations.view" />}>
            <Route path="/events/:id/registrations" element={<EventRegistrations />} />
          </Route>

          <Route element={<RequirePermission permission="members.manage" />}>
            <Route path="/members" element={<Members />} />
            {/* Whoever puts somebody in a register decides which exist. */}
            <Route path="/registers" element={<Registers />} />
          </Route>

          <Route element={<RequirePermission permission="history.manage" />}>
            <Route path="/history/new" element={<HistoryNew />} />
            <Route path="/history/:id/edit" element={<HistoryEdit />} />
          </Route>

          {/* The worklist across every open source and the archive for one
              of them, on the token the nav offers both links for. */}
          <Route element={<RequirePermission permission="messages.view" />}>
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/contact-messages" element={<ContactMessages />} />
          </Route>

          {/* The role editor. roles.manage, not members.manage (which gives
              roles to people): shaping a role and holding one are separate
              jobs. */}
          <Route element={<RequirePermission permission="roles.manage" />}>
            <Route path="/roles" element={<Roles />} />
          </Route>

          {/* The media library and one photo's own page. Its own permission:
              looking after the site's pictures is not the same job as editing
              the roster or the history. */}
          <Route element={<RequirePermission permission="images.manage" />}>
            <Route
              path="/media"
              element={
                <Suspense fallback={null}>
                  <Media />
                </Suspense>
              }
            />
            <Route
              path="/media/:id"
              element={
                <Suspense fallback={null}>
                  <MediaDetail />
                </Suspense>
              }
            />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
