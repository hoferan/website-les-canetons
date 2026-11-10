import { useState } from "react";

import { Scallop } from "../carnival/Scallop";
import { t } from "../i18n";
import { cn } from "@/lib/utils";
import { useBlockStored } from "../content/BlocksProvider";
import { useEditPillShown } from "../content/EditMode";
import { ActionLink, shownActions } from "../content/blocks/ActionLink";
import { useSite } from "../content/blocks/SiteBlock";
import { SiteEditor } from "../content/blocks/SiteEditor";
import { useBlockEditing } from "../content/blocks/useBlockEditing";
import { EditChip } from "../content/editor/EditChip";
import { tr } from "../content/translated";
import { NetworkMark, networksOf } from "./social";

/**
 * Where the pencil sits in edit mode. The scallops reach 22px into the footer
 * (BUMP_DEPTH in carnival/Scallop.tsx), so the corner's usual 8px would put the
 * pencil among them; at 36px it keeps a clear 14px below their lowest point.
 */
const CHIP_TOP = "top-9";

/**
 * The footer's top padding while the pencil shows: the 44px pencil ends at
 * 80px, and the band's name starts 4px below it, as CHIP_ROOM leaves a block's
 * heading clear of its chip.
 */
const CHIP_ROOM_BELOW = "pt-21";

/**
 * The foot of every page: who the band is, the two things a parent who has
 * read this far wants to do, and the band's accounts elsewhere.
 *
 * Two buttons at most, "Nous rejoindre" and "Contact" as shipped, are the only
 * page links. On a phone the Menu bar stays pinned to the top, so a copy of the
 * nav here would only lengthen the page; on a desktop these two cover what a
 * parent at the bottom of a page is looking for. They are the hero's buttons:
 * a public page or an https address, which opens in a new tab and says so.
 *
 * No badge: the mark on the flyers and costumes gets one prominent placement,
 * on the home page, not a repeat on every page. The band's name is text.
 *
 * The networks are named beside their marks, because few people recognise
 * Flickr's two dots without the word. A network with no name or no https
 * address is left out.
 *
 * The band's name, the line under it, the buttons, the legal name and the
 * networks are the site block (#106). In edit mode one chip on the footer's top
 * right opens its editor. It sits lower than a block's corner chip, below the
 * scallops, and the footer's text moves down to make room for it (see
 * {@link CHIP_TOP}).
 *
 * The top edge is scalloped in the colour of whatever sits above (ADR 0029),
 * which only the page knows: `above` comes from carnival/footerEdge.ts, and
 * null is the cream. On the cream the footer keeps its gap; under a coloured
 * band it sits flush, so the band's bumps hang straight into it.
 */
export function Footer({ above }: { above: string | null }) {
  const site = useSite();
  const editing = useBlockEditing();
  const siteChanged = useBlockStored("site");
  const [editingSite, setEditingSite] = useState(false);
  // The floating pill sits over the last 4rem of the page; keep it off the footer's own buttons.
  const pillShown = useEditPillShown();
  const follow = networksOf(site.networks);
  const actions = shownActions(site.actions);

  return (
    <footer
      data-edit-block="site"
      className={cn(
        "relative bg-stage text-white",
        above === null && "mt-16",
        pillShown && "pb-20",
      )}
    >
      <Scallop from={above ?? "var(--color-ground)"} />
      {editing ? (
        <>
          <div className={cn("absolute right-2 z-10", CHIP_TOP)}>
            <EditChip
              label={t("blocks.site")}
              text={t("blockEditor.site.edit")}
              corner={false}
              changed={siteChanged}
              onClick={() => setEditingSite(true)}
            />
          </div>
        </>
      ) : null}
      {editing || editingSite ? (
        <SiteEditor open={editingSite} onClose={() => setEditingSite(false)} />
      ) : null}
      <div className={cn("mx-auto max-w-shell px-4", editing ? CHIP_ROOM_BELOW : "pt-14")}>
        <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <p className="font-display text-lg">{site.name}</p>
            <p className="mt-2 max-w-md whitespace-pre-line text-white/70">{tr(site.pitch)}</p>
            {actions.length > 0 ? (
              <div className="mt-5 grid grid-cols-2 gap-3 sm:flex">
                {actions.map((action, index) => (
                  <ActionLink
                    key={`${action.to}-${index}`}
                    action={action}
                    index={index}
                    surface="stage"
                    className="px-5"
                  />
                ))}
              </div>
            ) : null}
          </div>

          <div>
            <p className="text-xs font-bold tracking-wider text-white/70 uppercase">
              {t("nav.followUs")}
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {follow.map(({ label, href, icon }, index) => (
                // The index too: two entries may share a name or an address.
                <li key={`${index}-${href}`} className="flex items-center">
                  <a
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    aria-label={t("nav.newTab", { name: label })}
                    className="focus-ring-stage inline-flex min-h-touch items-center gap-2 rounded-full bg-white/[0.08] px-3 text-sm font-semibold hover:bg-white/15 sm:px-4"
                  >
                    <NetworkMark icon={icon} className="size-5" />
                    {label}
                  </a>
                </li>
              ))}
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
