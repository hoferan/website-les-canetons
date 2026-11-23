import type { ComponentProps } from "react";

import { Button } from "@ds";

import { t } from "../../i18n";
import { Link } from "../../i18n/routing";
import { isPublicPage } from "../publicPages";
import { tr } from "../translated";
import { isActionTarget, type Action } from "../types";

/**
 * The buttons of a block that a link may render: a read lets any string
 * through, so a target that is neither a public page nor an https address is
 * dropped here. An imported `javascript:` address must never become an href.
 */
export function shownActions(actions: readonly Action[] | undefined): Action[] {
  return (actions ?? []).filter((action) => isActionTarget(action.to));
}

/**
 * One button of a hero or of the footer, the first the raised yellow one and
 * the second the light one. A public page keeps the visitor in their language
 * (i18n/routing.tsx); an https address opens in a new tab and says so in its
 * name, as every outbound link does.
 *
 * The outbound branch is a raw <a href>, so it gets no German prefix, and it
 * carries rel="noreferrer": target="_blank" without it hands the destination
 * a window.opener it can navigate.
 *
 * Pass only what {@link shownActions} kept.
 */
export function ActionLink({
  action,
  index,
  size,
  className,
}: {
  action: Action;
  index: number;
  size?: ComponentProps<typeof Button>["size"];
  className?: string;
}) {
  const label = tr(action.label);
  return (
    <Button
      asChild
      variant={index === 0 ? "accent" : "secondary"}
      {...(size ? { size } : {})}
      {...(className ? { className } : {})}
    >
      {isPublicPage(action.to) ? (
        <Link to={action.to}>{label}</Link>
      ) : (
        <a
          href={action.to}
          target="_blank"
          rel="noreferrer"
          aria-label={t("nav.newTab", { name: label })}
        >
          {label}
        </a>
      )}
    </Button>
  );
}
