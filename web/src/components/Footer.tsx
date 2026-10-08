import { Link } from "react-router-dom";

import { Scallop } from "../carnival/Scallop";
import { t } from "../i18n";
import { cn } from "@/lib/utils";
import { buttonVariants } from "./ui/button";
import {
  FACEBOOK_URL,
  FacebookMark,
  FlickrMark,
  GALLERY_URL,
  INSTAGRAM_URL,
  InstagramMark,
} from "./social";

/** Raised, as everything a visitor can press is, with the stage's pink shadow. */
const ACTION = "focus-ring-stage px-5 shadow-raised-stage";

/**
 * The foot of every page: who the band is, the two things a parent who has
 * read this far wants to do, and the band's accounts elsewhere.
 *
 * "NOUS REJOINDRE" AND "CONTACT" ARE THE ONLY PAGE LINKS. On a phone the Menu bar stays
 * pinned to the top, so a second copy of the nav here would only lengthen the
 * page. On a desktop the bar scrolls away, and these two links cover what a
 * parent at the bottom of a page is looking for.
 *
 * NO BADGE, DELIBERATELY. It was briefly shown here and taken out again on
 * 2026-09-03: it is the mark on the flyers and the costumes, so it earns one
 * prominent placement rather than a repeat in the chrome of every page. That
 * placement is the home page. The band's name is set in text instead.
 *
 * THE NETWORKS ARE NAMED beside their marks, because few people recognise
 * Flickr's two dots without the word.
 *
 * THE TOP EDGE IS SCALLOPED in the colour of whatever sits above (ADR 0029),
 * which only the page knows: `above` comes from carnival/footerEdge.ts, and
 * null is the cream. On the cream the footer keeps its gap; under a coloured
 * band it sits flush, so the band's bumps hang straight into it.
 */
export function Footer({ above }: { above: string | null }) {
  const follow = [
    { href: INSTAGRAM_URL, name: "Instagram", label: t("nav.instagramLabel"), Mark: InstagramMark },
    { href: FACEBOOK_URL, name: "Facebook", label: t("nav.facebookLabel"), Mark: FacebookMark },
    { href: GALLERY_URL, name: "Flickr", label: t("nav.flickrLabel"), Mark: FlickrMark },
  ];

  return (
    <footer className={cn("relative bg-stage text-white", above === null && "mt-16")}>
      <Scallop from={above ?? "var(--color-ground)"} />
      <div className="mx-auto max-w-shell px-4 pt-14">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <p className="font-display text-lg">Les Canetons de Fribourg</p>
            <p className="mt-2 max-w-md text-white/70">{t("nav.footerPitch")}</p>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:flex">
              <Link to="/join" className={cn(buttonVariants({ variant: "raised" }), ACTION)}>
                {t("nav.join")}
              </Link>
              <Link
                to="/contact"
                className={cn(buttonVariants({ variant: "raised-light" }), ACTION)}
              >
                {t("nav.contact")}
              </Link>
            </div>
          </div>

          <div>
            <p className="text-xs font-bold tracking-wider text-white/70 uppercase">
              {t("nav.followUs")}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {follow.map(({ href, name, label, Mark }) => (
                <li key={href}>
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={label}
                    className="focus-ring-stage inline-flex min-h-touch items-center gap-2 rounded-full bg-white/[0.08] px-3 text-sm font-semibold hover:bg-white/15 sm:px-4"
                  >
                    <Mark className="size-5" />
                    {name}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-white/10 py-5 text-xs text-white/70">
          © {new Date().getFullYear()} Guggenmusik les canetons de Fribourg. {t("nav.rights")}
        </p>
      </div>
    </footer>
  );
}
