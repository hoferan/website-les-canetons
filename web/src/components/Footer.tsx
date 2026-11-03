import { useState } from "react";
import { Link } from "react-router-dom";

import { Scallop } from "../carnival/Scallop";
import { t } from "../i18n";
import { cn } from "@/lib/utils";
import { useEditPillShown } from "../content/EditMode";
import { useSite } from "../content/blocks/SiteBlock";
import { SiteEditor } from "../content/blocks/SiteEditor";
import { useBlockEditing } from "../content/blocks/useBlockEditing";
import { EditChip } from "../content/editor/EditChip";
import { tr } from "../content/translated";
import { buttonVariants } from "./ui/button";
import { FacebookMark, FlickrMark, InstagramMark, type Network, networkUrl } from "./social";

/** Raised, as everything a visitor can press is, with the stage's pink shadow. */
const ACTION = "focus-ring-stage px-5 shadow-raised-stage";

/**
 * The foot of every page: who the band is, the two things a parent who has
 * read this far wants to do, and the band's accounts elsewhere.
 *
 * "Nous rejoindre" and "Contact" are the only page links. On a phone the Menu
 * bar stays pinned to the top, so a copy of the nav here would only lengthen
 * the page; on a desktop these two cover what a parent at the bottom of a page
 * is looking for.
 *
 * No badge: the mark on the flyers and costumes gets one prominent placement,
 * on the home page, not a repeat on every page. The band's name is text.
 *
 * The networks are named beside their marks, because few people recognise
 * Flickr's two dots without the word. A network the band has no address for
 * is left out.
 *
 * The band's name, the line under it, the legal name and the networks are the
 * site block (#106). In edit mode one chip on the footer's top right opens its editor.
 *
 * The top edge is scalloped in the colour of whatever sits above (ADR 0029),
 * which only the page knows: `above` comes from carnival/footerEdge.ts, and
 * null is the cream. On the cream the footer keeps its gap; under a coloured
 * band it sits flush, so the band's bumps hang straight into it.
 */
export function Footer({ above }: { above: string | null }) {
  const site = useSite();
  const editing = useBlockEditing();
  const [editingSite, setEditingSite] = useState(false);
  // The floating pill sits over the last 4rem of the page; keep it off the footer's own buttons.
  const pillShown = useEditPillShown();
  const follow: { network: Network; name: string; label: string; Mark: typeof InstagramMark }[] = [
    {
      network: "instagram",
      name: "Instagram",
      label: t("nav.instagramLabel"),
      Mark: InstagramMark,
    },
    { network: "facebook", name: "Facebook", label: t("nav.facebookLabel"), Mark: FacebookMark },
    { network: "flickr", name: "Flickr", label: t("nav.flickrLabel"), Mark: FlickrMark },
  ];

  return (
    <footer
      className={cn(
        "relative bg-stage text-white",
        above === null && "mt-16",
        pillShown && "pb-20",
      )}
    >
      <Scallop from={above ?? "var(--color-ground)"} />
      {editing ? (
        <>
          <EditChip
            label={t("blocks.site")}
            text={t("blockEditor.site.edit")}
            onClick={() => setEditingSite(true)}
          />
          <SiteEditor open={editingSite} onClose={() => setEditingSite(false)} />
        </>
      ) : null}
      <div className="mx-auto max-w-shell px-4 pt-14">
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <p className="font-display text-lg">{site.name}</p>
            <p className="mt-2 max-w-md whitespace-pre-line text-white/70">{tr(site.pitch)}</p>
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
              {follow.map(({ network, name, label, Mark }) => {
                const href = networkUrl(site.networks, network);
                if (!href) return null;
                return (
                  <li key={network} className="flex items-center">
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
                );
              })}
            </ul>
          </div>
        </div>

        <p className="mt-10 border-t border-white/10 py-5 text-xs text-white/70">
          © {new Date().getFullYear()} {site.legalName}. {t("nav.rights")}
        </p>
      </div>
    </footer>
  );
}
