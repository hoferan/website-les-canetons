import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { MustChangePassword } from "./components/MustChangePassword";
import { RequirePermission, RequireSession } from "./components/guards";
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
import { Events } from "./pages/Events";
import { History } from "./pages/History";
import { Home } from "./pages/Home";
import { Inbox } from "./pages/Inbox";
import { Join } from "./pages/Join";
import { Login } from "./pages/Login";
import { Members } from "./pages/Members";
import { NotFound } from "./pages/NotFound";

/**
 * The route table.
 *
 * URLs ARE RESOURCE-ORIENTED, and there is deliberately no `/admin` or
 * `/manage` namespace: under real RBAC there is no single privileged area —
 * `events.manage` and `members.manage` are different people — and a namespace
 * named after a permission level is a lie about the model (ADR 0014). The nav
 * still groups Direction screens under one heading; nav grouping and URL
 * structure are different problems, and only one of them has to encode
 * authorization.
 *
 * MustChangePassword wraps everything INSIDE the layout: a committee-issued
 * password must be replaced before any other screen is usable, and the gate has
 * to see the pathname to exempt /account/password from its own redirect. `/login` sits
 * inside it on purpose — a member who must change their password and navigates
 * there is already logged in, so sending them to /account/password is right. It cannot
 * trap anyone, because logging out is a button in the chrome rather than a
 * route.
 *
 * Legacy French paths are NOT redirected — the rebuild owes no backwards
 * compatibility (ADR 0003) — so they fall through to the 404 view like
 * every other unknown path.
 *
 * THE PUBLIC PAGES SIT OUTSIDE MustChangePassword, and that is the one thing
 * about this table worth reading twice. The gate holds a member on /account/password
 * until they have replaced a committee-issued password — which is right for
 * the members' tool and wrong for the public site: a member in that state who
 * taps "Histoire" has no business being bounced to a password form, because
 * that page is what a stranger sees and owes nothing to who is logged in. The
 * gate still covers everything the password actually unlocks.
 *
 * Registration adds three: `/events/:id/book` above with the public pages, and
 * `/events/:id/registrations` and `/events/:id/registration-options` below
 * with the committee's. The three sit under one prefix and answer to three
 * different guards, which is the argument against an `/admin` namespace made
 * concrete: "who may book", "who may read the guest list" and "who may
 * configure the event" are three different people.
 */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<Layout />}>
        {/* THE PUBLIC FACE. No session, no gate, no guard — see the note
            above on why these sit outside MustChangePassword. */}
        <Route index element={<Home />} />
        <Route path="/agenda" element={<Agenda />} />
        <Route path="/band" element={<Band />} />
        <Route path="/committee" element={<Committee />} />
        <Route path="/history" element={<History />} />
        <Route path="/join" element={<Join />} />
        <Route path="/contact" element={<Contact />} />

        {/* THE BOOKING FORM IS A PUBLIC PAGE under a path whose other
            segments are not, and that is deliberate rather than untidy:
            registration is a property of an EVENT (ADR 0020), so the event is
            what the URL is about, and inventing /booking/:id would say the
            souper is a feature of its own, which is the shape that decision
            removed.
            Nothing leaks by sitting here: the endpoint behind it answers 404
            for an event that takes no bookings, whether or not it exists.

            `book`, NOT `register`. In this project a register is a PUPITRE —
            RegisterIndex, `sections`, "Trompettes" — so /events/:id/register
            would read as the drummers' page. */}
        <Route path="/events/:id/book" element={<EventBooking />} />

        <Route element={<MustChangePassword />}>
          <Route path="/login" element={<Login />} />
          <Route path="/account" element={<Account />} />
          <Route path="/account/password" element={<AccountPassword />} />

          {/* Needs a SESSION and nothing more — reading the planning is
              something everybody in the band does. It still sits behind
              login: this planning is the members' tool, and the public
              agenda is a separate page. */}
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

            {/* What the event OFFERS, which is part of the event — hence
                `events.manage` and not a registration permission. It writes on
                its own entity-tag facet, `event.options`, so correcting a
                dress code cannot refuse a pending options edit and changing an
                option cannot slip past one. */}
            <Route path="/events/:id/registration-options" element={<EventRegistrationOptions />} />
          </Route>

          {/* The chase list. A SEPARATE PERMISSION from managing events:
              seeing who has not answered and entering the planning are
              different jobs, and the `permission:` route middleware
              (App\Http\Middleware\RequirePermission) is what makes that
              real — this guard only mirrors it. */}
          <Route element={<RequirePermission permission="attendance.view_all" />}>
            <Route path="/events/:id/attendance" element={<EventAttendance />} />
          </Route>

          {/* The guest list. `registrations.view` is ALL the `committee` role
              holds, so this route is guarded on it and nothing more — the
              amend and cancel controls inside answer to `registrations.manage`
              instead, which is a different act on somebody else's personal
              data and a different set of people. */}
          <Route element={<RequirePermission permission="registrations.view" />}>
            <Route path="/events/:id/registrations" element={<EventRegistrations />} />
          </Route>

          <Route element={<RequirePermission permission="members.manage" />}>
            <Route path="/members" element={<Members />} />
          </Route>

          {/* messages.view, both routes: the worklist across every open
              source and the archive for one of them. The
              nav only offers either link to someone who holds the
              permission, so guarding the routes on the same token keeps each
              page consistent with its own entry. */}
          <Route element={<RequirePermission permission="messages.view" />}>
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/contact-messages" element={<ContactMessages />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}
