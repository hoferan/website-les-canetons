import { ButtonLink } from "@/components/ButtonLink";

import { t } from "../../i18n";
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
 * through the router's basename; an https address opens in a new tab and says
 * so in its name, as every outbound link does.
 *
 * Pass only what {@link shownActions} kept.
 */
export function ActionLink({
  action,
  index,
  surface,
  className,
}: {
  action: Action;
  index: number;
  surface?: "page" | "stage";
  className?: string;
}) {
  const external = !isPublicPage(action.to);
  const label = tr(action.label);
  return (
    <ButtonLink
      to={action.to}
      external={external}
      {...(external ? { ariaLabel: t("nav.newTab", { name: label }) } : {})}
      variant={index === 0 ? "accent" : "secondary"}
      {...(surface ? { surface } : {})}
      {...(className ? { className } : {})}
    >
      {label}
    </ButtonLink>
  );
}
