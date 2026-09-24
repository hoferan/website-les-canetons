import { type ReactNode, useId } from "react";

import { t } from "../i18n";
import { type NavEntry, EntryLink } from "./NavEntry";
import { PHONE_ACTIVE, PHONE_IDLE, PHONE_ITEM, PHONE_ROW } from "./navStyles";

/**
 * The phone list, shown under the Menu bar while the menu is open.
 *
 * LOGGED IN, IT STARTS WITH THE MEMBER (#99): the account row, then "Mon
 * espace" (their own tools), then "Le groupe" (the public pages). A member
 * opens this menu to reach their own things. Two headed groups also stop the
 * list reading as one endless column, which is what a "more" row would have
 * tried to fix by hiding things a second time inside a menu that already
 * hides them.
 *
 * LOGGED OUT, THERE IS ONE GROUP AND NO HEADING: the public pages, then the
 * login, because a stranger is here for the pages.
 */
export function PhoneNav({
  account,
  mine,
  band,
  login,
  active,
  close,
}: {
  /** The account disclosure, or null when nobody is logged in. */
  account: ReactNode;
  /** The member's own tools. Empty when nobody is logged in. */
  mine: NavEntry[];
  band: NavEntry[];
  /** The login row, or null when somebody is logged in. */
  login: ReactNode;
  active: string;
  close: () => void;
}) {
  const mineId = useId();
  const bandId = useId();

  return (
    <div id="nav-menu" className="animate-reveal border-t border-line text-sm md:hidden">
      {account !== null ? <div className="border-b border-line">{account}</div> : null}

      {mine.length > 0 ? (
        <>
          <GroupHeading id={mineId}>{t("nav.groupMine")}</GroupHeading>
          <Rows labelledBy={mineId} entries={mine} active={active} close={close} />
        </>
      ) : null}

      {account !== null ? <GroupHeading id={bandId}>{t("nav.groupBand")}</GroupHeading> : null}
      <Rows
        labelledBy={account !== null ? bandId : undefined}
        entries={band}
        active={active}
        close={close}
        after={login !== null ? <li className={PHONE_ITEM}>{login}</li> : null}
      />
    </div>
  );
}

function GroupHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p
      id={id}
      className="border-b border-line px-4 pt-4 pb-2 text-xs font-semibold tracking-wider text-ink-muted uppercase"
    >
      {children}
    </p>
  );
}

function Rows({
  entries,
  active,
  close,
  labelledBy,
  after,
}: {
  entries: NavEntry[];
  active: string;
  close: () => void;
  labelledBy?: string;
  after?: ReactNode;
}) {
  return (
    <ul aria-labelledby={labelledBy} className="border-b border-line last:border-0">
      {entries.map((entry) => (
        <li key={entry.key} className={PHONE_ITEM}>
          <EntryLink
            entry={entry}
            active={entry.to === active}
            onClick={close}
            className={`${PHONE_ROW} ${entry.to === active ? PHONE_ACTIVE : PHONE_IDLE}`}
          />
        </li>
      ))}
      {after}
    </ul>
  );
}
