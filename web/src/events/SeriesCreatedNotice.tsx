import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";

import { Notice } from "@ds";

import { t } from "../i18n";
import { Link, useNavigate } from "../i18n/routing";

/** What the series generator hands the planning as it navigates there. */
export type SeriesCreatedState = { seriesCreated: number };

function countFrom(state: unknown): number | null {
  const count = (state as Partial<SeriesCreatedState> | null)?.seriesCreated;
  return typeof count === "number" ? count : null;
}

/**
 * "5 événements créés." on the planning, after the series generator saved.
 *
 * The count arrives after mount, into a live region that is already there: a
 * region rendered with its text inside is not announced. So the Notice sits
 * inside a role="status" this component renders first, as Notice asks of a
 * notice that answers something the reader just did.
 *
 * Read once, then cleared from the history entry, so a reload or "back" does
 * not report the same season as created again.
 *
 * It stays until dismissed. The season has two rehearsal variants, so the
 * link to a second series is the usual next step and must not time out like
 * a toast.
 */
export function SeriesCreatedNotice() {
  const location = useLocation();
  const navigate = useNavigate();
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    const arrived = countFrom(location.state);
    if (arrived === null) {
      return;
    }
    setCount(arrived);
    void navigate(
      { pathname: location.pathname, search: location.search },
      { replace: true, state: null },
    );
  }, [location, navigate]);

  return (
    <div role="status" className="empty:hidden mt-block">
      {count !== null ? (
        <Notice
          level="success"
          dismiss={{ label: t("seriesForm.dismissCreated"), onDismiss: () => setCount(null) }}
        >
          {/* At 390px the link wraps onto a line of its own, and the ✕ stays
              beside both in the notice's own column. */}
          <span className="flex flex-wrap items-center gap-x-related">
            <span>{t("seriesForm.createdCount", { count })}</span>
            <Link
              to="/events/new/series"
              className="focus-ring inline-flex min-h-touch items-center underline"
            >
              {t("seriesForm.another")}
            </Link>
          </span>
        </Notice>
      ) : null}
    </div>
  );
}
