import { cn } from "@/lib/utils";

import { buttonVariants } from "./ui/button";
import { t } from "../i18n";

/**
 * Jump links to each register on the band page.
 *
 * The page is long because it carries one photograph per register, so it gets
 * an index instead of being shortened. Side-by-side registers would help on a
 * desktop only and leave uneven rows; disclosures would hide the band, and
 * already mean "archive" on this site.
 *
 * It knows nothing about registers: the page owns that list.
 */
export function RegisterIndex({ entries }: { entries: { id: string; label: string }[] }) {
  return (
    // Named because this is the page's second nav, and unnamed navs are
    // indistinguishable to a screen reader moving by landmark.
    <nav aria-label={t("band.registersNav")} className="mt-block">
      <ul className="flex flex-wrap gap-2">
        {entries.map((entry) => (
          <li key={entry.id}>
            {/*
              A plain <a>, not a router Link: react-router would treat "#drums"
              as a route. ScrollToTop abstains on a hash, and the phone's
              sticky Menu bar is cleared by scroll-padding-top in styles.css.
            */}
            <a
              href={`#${entry.id}`}
              className={cn(buttonVariants({ variant: "secondary", size: "sm" }), "focus-ring")}
            >
              {entry.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
