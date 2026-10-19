import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";

import { Notice } from "../components/Notice";
import { t } from "../i18n";

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
 * region rendered with its text inside is not announced. That is why this
 * wraps a Notice in role="status" although Notice's docblock rules a live
 * region out; those notices are there before the reader arrives, and this one
 * answers something they just did.
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
        /* A grid, so the close control stays beside the count at 390px,
           where the link takes a row of its own. From `sm` all three sit on
           one line. */
        <Notice className="grid grid-cols-[1fr_auto] items-center gap-x-related sm:grid-cols-[1fr_auto_auto]">
          <span>{t("seriesForm.createdCount", { count })}</span>
          <Link
            to="/events/new/series"
            className="focus-ring order-last col-span-2 inline-flex min-h-touch items-center justify-self-start underline sm:order-none sm:col-span-1"
          >
            {t("seriesForm.another")}
          </Link>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("seriesForm.dismissCreated")}
            onClick={() => setCount(null)}
          >
            <X aria-hidden="true" />
          </Button>
        </Notice>
      ) : null}
    </div>
  );
}
