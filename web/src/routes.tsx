import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { RequireAuth, RequireCapability } from "./components/guards";
import { Accueil } from "./pages/Accueil";
import { Admin } from "./pages/Admin";
import { Canetons } from "./pages/Canetons";
// HIDDEN 2026-08-31 — see the comment on the routes below.
// import { Cd } from "./pages/Cd";
import { ComiteTeamDirection } from "./pages/ComiteTeamDirection";
import { Commencement } from "./pages/Commencement";
import { Confirmation } from "./pages/Confirmation";
import { Contact } from "./pages/Contact";
import { Historique } from "./pages/Historique";
import { InscriptionsAdmin } from "./pages/InscriptionsAdmin";
import { InscriptionsUtilisateurs } from "./pages/InscriptionsUtilisateurs";
import { Login } from "./pages/Login";
import { Moniteurs } from "./pages/Moniteurs";
// HIDDEN 2026-08-31 — see the comment on the routes below.
// import { Multimedia } from "./pages/Multimedia";
import { NotFound } from "./pages/NotFound";
import { PlanningRepet } from "./pages/PlanningRepet";
import { Signup } from "./pages/Signup";
import { SignupThanks } from "./pages/SignupThanks";
import { SignupsAdmin } from "./pages/SignupsAdmin";
import { Sinscrire } from "./pages/Sinscrire";
// HIDDEN 2026-08-31 — see the comment on the routes below.
// import { Sponsors } from "./pages/Sponsors";
import { useSession } from "./session/SessionProvider";

/**
 * The route table.
 *
 * The URL set is FROZEN: these are the paths the live site serves today, and
 * "no URL changes" is an explicit non-goal of the cutover. The French slugs and
 * the underscores are not tidied — every one of them is in somebody's
 * bookmarks and in Google's index.
 *
 * The three souper routes exist only while the feature is on, exactly as the
 * old route table registered them conditionally: a server with the feature off
 * genuinely has no such page rather than an empty one, which is what makes a
 * disabled route indistinguishable from an absent one.
 */
export function AppRoutes() {
  const { config } = useSession();

  return (
    <Routes>
      {/* One layout route wrapping every page, so the header, nav, ribbon and
          footer mount once and survive navigation instead of remounting. */}
      <Route element={<Layout />}>
        <Route path="/" element={<Accueil />} />
        <Route path="/historique" element={<Historique />} />
        <Route path="/canetons" element={<Canetons />} />
        {/* HIDDEN 2026-08-31, not deleted.
            /cd was headed "2022 - Les Canetons ont 20 ans !!!" and still said
            the CD "vient de sortir"; /multimedia was a single France 3
            reportage from 2016. The 2026-08-31 content audit asked whether
            either was still wanted and the answer was "don't know yet — just
            hide the page for now".

            Commented out rather than feature-flagged, deliberately. A flag
            would need a key in api/config/app.php and api/.env.example, and the
            deploy's config-shape preflight REFUSES (exit 2) against any server
            whose api-laravel/.env lacks a key it expects — so hiding two pages
            would become a coordinated hand-edit of .env on TEST, QA and PROD.
            Uncommenting these four lines is the whole of the reverse.

            The components and their content are untouched in
            web/src/pages/Cd.tsx and web/src/pages/Multimedia.tsx. All three
            URLs now fall through to the SPA's own 404 view, which is what every
            unknown path already does.

            /sponsors joined them on the same day, after its links had just been
            audited and repaired. That work is not wasted — it is correct
            whenever the page returns — but the page itself is hidden for now. */}
        {/* <Route path="/cd" element={<Cd />} /> */}
        <Route path="/commencement" element={<Commencement />} />
        <Route path="/moniteurs" element={<Moniteurs />} />
        {/* <Route path="/sponsors" element={<Sponsors />} /> */}
        {/* <Route path="/multimedia" element={<Multimedia />} /> */}
        <Route path="/contact" element={<Contact />} />
        <Route path="/comite_teamdirection" element={<ComiteTeamDirection />} />
        <Route path="/authentification_inscription" element={<Login />} />
        <Route
          path="/sinscrire"
          element={
            <RequireAuth>
              <Sinscrire />
            </RequireAuth>
          }
        />
        <Route path="/confirmation" element={<Confirmation />} />
        <Route
          path="/inscriptions_utilisateurs"
          element={
            <RequireCapability capability="respond">
              <InscriptionsUtilisateurs />
            </RequireCapability>
          }
        />
        <Route path="/planning_repet" element={<PlanningRepet />} />
        <Route
          path="/admin"
          element={
            <RequireCapability capability="manage_events">
              <Admin />
            </RequireCapability>
          }
        />
        <Route
          path="/inscriptions_admin"
          element={
            <RequireCapability capability="view_summary">
              <InscriptionsAdmin />
            </RequireCapability>
          }
        />

        {config.features.souper_signup ? (
          <>
            <Route path="/signup" element={<Signup />} />
            <Route path="/signup_thanks" element={<SignupThanks />} />
            <Route
              path="/signups_admin"
              element={
                <RequireCapability capability="view_summary">
                  <SignupsAdmin />
                </RequireCapability>
              }
            />
          </>
        ) : null}

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
