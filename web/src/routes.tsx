import { Route, Routes } from "react-router-dom";

import { Layout } from "./components/Layout";
import { NotFound } from "./pages/NotFound";
import { Placeholder } from "./pages/Placeholder";
import { PlanningRepet } from "./pages/PlanningRepet";
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
        <Route path="/" element={<Placeholder title="Accueil" />} />
        <Route path="/historique" element={<Placeholder title="Historique" />} />
        <Route path="/canetons" element={<Placeholder title="Les canetons" />} />
        <Route path="/cd" element={<Placeholder title="CD" />} />
        <Route path="/commencement" element={<Placeholder title="Commencer les Canetons" />} />
        <Route path="/moniteurs" element={<Placeholder title="Moniteurs" />} />
        <Route path="/sponsors" element={<Placeholder title="Sponsors et liens amis" />} />
        <Route path="/multimedia" element={<Placeholder title="Multimédia" />} />
        <Route path="/contact" element={<Placeholder title="Contact" />} />
        <Route path="/comite_teamdirection" element={<Placeholder title="Contact Canetons" />} />
        <Route path="/authentification_inscription" element={<Placeholder title="Connexion" />} />
        <Route path="/sinscrire" element={<Placeholder title="Inscriptions" />} />
        <Route path="/confirmation" element={<Placeholder title="Confirmation" />} />
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
