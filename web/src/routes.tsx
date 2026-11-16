import { Route, Routes, useParams } from "react-router-dom";

import { Navigate, useLocale } from "./i18n/routing";

import { Layout } from "./components/Layout";
import { MustChangePassword } from "./components/MustChangePassword";
import { RequirePermission } from "./components/guards";
import { Agenda } from "./pages/Agenda";
import { Band } from "./pages/Band";
import { Committee } from "./pages/Committee";
import { Contact } from "./pages/Contact";
import { EventBooking } from "./pages/EventBooking";
import { History } from "./pages/History";
import { Home } from "./pages/Home";
import { Join } from "./pages/Join";
import { NotFound } from "./pages/NotFound";
import { INBOX_PERMISSIONS } from "./lib/inboxPermissions";
import { lazyNamed } from "./lib/lazy";
import { WEBSITE_PERMISSIONS } from "./lib/websitePermissions";

// Only the public pages above are in the entry. Every page behind the login
// is a chunk of its own, loaded the first time its route renders, so a
// visitor never downloads the member roster, the editors or the inbox (#396).
// Login is here too: most visitors never open it.
//
// A navigation is a transition, so the previous page stays up while the chunk
// loads. Only a fresh load of the URL shows the empty fallback, the Suspense
// around the Outlet in Layout.
const Account = lazyNamed(() => import("./pages/Account"), "Account");
const AccountPassword = lazyNamed(() => import("./pages/AccountPassword"), "AccountPassword");
const ContactMessages = lazyNamed(() => import("./pages/ContactMessages"), "ContactMessages");
const EventAttendance = lazyNamed(() => import("./pages/EventAttendance"), "EventAttendance");
const EventEdit = lazyNamed(() => import("./pages/EventEdit"), "EventEdit");
const EventFormEditor = lazyNamed(() => import("./pages/EventFormEditor"), "EventFormEditor");
const EventNew = lazyNamed(() => import("./pages/EventNew"), "EventNew");
const EventRegistrations = lazyNamed(
  () => import("./pages/EventRegistrations"),
  "EventRegistrations",
);
const EventSeriesNew = lazyNamed(() => import("./pages/EventSeriesNew"), "EventSeriesNew");
const EventTags = lazyNamed(() => import("./pages/EventTags"), "EventTags");
const Events = lazyNamed(() => import("./pages/Events"), "Events");
const Inbox = lazyNamed(() => import("./pages/Inbox"), "Inbox");
const Login = lazyNamed(() => import("./pages/Login"), "Login");
const Members = lazyNamed(() => import("./pages/Members"), "Members");
const Registers = lazyNamed(() => import("./pages/Registers"), "Registers");
const Roles = lazyNamed(() => import("./pages/Roles"), "Roles");
// The library's two pages bring the upload queue and the shrink step.
const Media = lazyNamed(() => import("./pages/Media"), "Media");
const MediaDetail = lazyNamed(() => import("./pages/MediaDetail"), "MediaDetail");
// The website export and import pull in a zip library and the upload queue,
// which only an administrator ever needs (#336).
const Website = lazyNamed(() => import("./pages/Website"), "Website");

// The button catalogue is for developers. `import.meta.env.DEV` is a literal
// in a build, so the import and the route below are dropped from the bundle.
const DevUi = import.meta.env.DEV ? lazyNamed(() => import("./pages/DevUi"), "DevUi") : null;

/**
 * The route table.
 *
 * URLs are resource-oriented, with no `/admin` or `/manage` namespace:
 * `events.manage` and `members.manage` are different people, so there is no
 * single privileged area to name (ADR 0014). The nav may still group screens;
 * only the URL would encode authorization. `/events/:id/book`,
 * `/events/:id/registrations` and `/events/:id/book/edit` share a prefix and
 * answer to three different guards.
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
 *
 * Both languages share this table: it sees the path with `/de` taken off
 * (`LocaleFromUrl`), so a change of language keeps the page mounted. It reads
 * the language so that a change renders it again, and with it every page in
 * the new language.
 */
export function AppRoutes() {
  useLocale();

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

            {/* The booking form, built in place (#319). What the event
                offers is part of the event, hence `events.manage`. It writes
                on its own entity-tag facet, `event.options`, so a dress code
                fix cannot refuse a pending form edit and a form change cannot
                slip past one. */}
            <Route path="/events/:id/book/edit" element={<EventFormEditor />} />
            {/* The options screen it replaced, for a bookmark. */}
            <Route path="/events/:id/registration-options" element={<ToFormEditor />} />

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

          {/* The worklist across every open source, for anybody who may see
              one of them, and the archive of the public's messages on its own
              token. */}
          <Route element={<RequirePermission permission={INBOX_PERMISSIONS} />}>
            <Route path="/inbox" element={<Inbox />} />
          </Route>
          <Route element={<RequirePermission permission="messages.view" />}>
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
            <Route path="/media" element={<Media />} />
            <Route path="/media/:id" element={<MediaDetail />} />
          </Route>

          {/* The whole public site, carried between servers (#336). */}
          <Route element={<RequirePermission permission={WEBSITE_PERMISSIONS} every />}>
            <Route path="/website" element={<Website />} />
          </Route>

          {DevUi ? <Route path="/dev/ui" element={<DevUi />} /> : null}

          <Route path="*" element={<NotFound />} />
        </Route>
      </Route>
    </Routes>
  );
}

/** The old options address, sent on to the form editor of the same event. */
function ToFormEditor() {
  const { id } = useParams();

  return <Navigate replace to={`/events/${id}/book/edit`} />;
}
