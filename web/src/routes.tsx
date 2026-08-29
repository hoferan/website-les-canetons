import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { RequireAuth } from "./components/guards";
import { Accueil } from "./pages/Accueil";
import { Canetons } from "./pages/Canetons";
import { Cd } from "./pages/Cd";
import { ComiteTeamDirection } from "./pages/ComiteTeamDirection";
import { Commencement } from "./pages/Commencement";
import { Confirmation } from "./pages/Confirmation";
import { Contact } from "./pages/Contact";
import { Historique } from "./pages/Historique";
import { Login } from "./pages/Login";
import { Moniteurs } from "./pages/Moniteurs";
import { Multimedia } from "./pages/Multimedia";
import { NotFound } from "./pages/NotFound";
import { Placeholder } from "./pages/Placeholder";
import { PlanningRepet } from "./pages/PlanningRepet";
import { Sinscrire } from "./pages/Sinscrire";
import { Sponsors } from "./pages/Sponsors";
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
        <Route path="/cd" element={<Cd />} />
        <Route path="/commencement" element={<Commencement />} />
        <Route path="/moniteurs" element={<Moniteurs />} />
        <Route path="/sponsors" element={<Sponsors />} />
        <Route path="/multimedia" element={<Multimedia />} />
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
          element={<Placeholder title="Mes inscriptions" />}
        />
        <Route path="/planning_repet" element={<PlanningRepet />} />
        <Route path="/admin" element={<Placeholder title="Administration" />} />
        <Route path="/inscriptions_admin" element={<Placeholder title="Inscriptions (admin)" />} />

        {config.features.souper_signup ? (
          <>
            <Route path="/signup" element={<Placeholder title="S’inscrire au souper" />} />
            <Route path="/signup_thanks" element={<Placeholder title="Merci" />} />
            <Route path="/signups_admin" element={<Placeholder title="Souper (admin)" />} />
          </>
        ) : null}

        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
