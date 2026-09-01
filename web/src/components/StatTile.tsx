import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * One number and its label, from the /inscriptions_admin summary.
 *
 * On a phone the four of these used to stack full-width and cost 470px of an
 * 844px screen for four numbers. The page grids them 2-up below `sm` now; this
 * component only has to be happy at either width.
 *
 * `li`, not `div`: the page renders them inside a named <ul> with
 * aria-live="polite", and a div there is invalid markup that breaks the
 * listitem query the page's test uses.
 *
 * `data-tile` is kept because InscriptionsAdmin.test.tsx selects on it -- the
 * tiles and the table below share the words "Participe" and "Ne participe pas",
 * so an accessible-name query for one of them would match a tile AND several
 * table cells at once.
 *
 * `gap-0 p-5` overrides the vendored Card's `gap-6 py-6`, which is meant for its
 * Header/Content/Footer composition rather than a compact tile. cn() is
 * tailwind-merge, so these win outright instead of both classes landing.
 */
export function StatTile({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className?: string;
}) {
  return (
    <Card asChild className={cn("gap-0 p-5 text-center", className)}>
      <li data-tile>
        <p className="font-display text-4xl text-violet">{value}</p>
        <p className="mt-1 text-sm text-ink-muted">{label}</p>
      </li>
    </Card>
  );
}
