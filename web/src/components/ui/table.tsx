import * as React from "react";

import { cn } from "@/lib/utils";

/**
 * VENDORED from shadcn/ui, WITHOUT its scroll container.
 *
 * The registry version wraps the table in its own
 * `<div className="relative w-full overflow-x-auto">`. Both pages that use this
 * own a scroller of their own instead.
 *
 * This paragraph used to cite `/signups_admin` as the precedent for doing that
 * well -- a role="region" with tabIndex={0} and its own label, plus a `min-w-*`
 * on the TABLE, which is the thing that actually gives a container something to
 * scroll (`w-full` inside an overflow-x container is 100% OF THAT CONTAINER, so
 * the table squeezes instead of scrolling). THAT PAGE NO LONGER EXISTS: it
 * belonged to the `app/` front-controller app deleted in the SPA cutover, and
 * neither surviving caller does any of it. Both are plain divs. Making them
 * keyboard-reachable is issue #15; the rule below is still right and still
 * load-bearing, it just has no live example any more.
 *
 * Keeping shadcn's div as well would nest two scroll containers, which on a
 * phone is a genuinely unpleasant bug: the inner one swallows the gesture and
 * the outer, focusable one never moves. Exactly one scroller, owned by the page
 * that knows how wide its own table is.
 */
function Table({ className, ...props }: React.ComponentProps<"table">) {
  return (
    <table
      data-slot="table"
      className={cn("w-full caption-bottom text-sm", className)}
      {...props}
    />
  );
}

function TableHeader({ className, ...props }: React.ComponentProps<"thead">) {
  return <thead data-slot="table-header" className={cn("[&_tr]:border-b", className)} {...props} />;
}

function TableBody({ className, ...props }: React.ComponentProps<"tbody">) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  );
}

function TableFooter({ className, ...props }: React.ComponentProps<"tfoot">) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn("border-t bg-muted/50 font-medium [&>tr]:last:border-b-0", className)}
      {...props}
    />
  );
}

function TableRow({ className, ...props }: React.ComponentProps<"tr">) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted",
        className,
      )}
      {...props}
    />
  );
}

/**
 * DIVERGES FROM THE REGISTRY VERSION: `scope="col"`.
 *
 * shadcn's `TableHead` emits a bare `<th>`. In both of this project's tables it
 * is a column header in a single header row, so `scope="col"` is the right
 * default and nothing in the SPA declared one before this.
 *
 * It is written ABOVE `{...props}` on purpose. JSX takes the last occurrence,
 * so putting it below would make a caller's `scope="row"` silently vanish —
 * `table.test.tsx` pins the override to keep that honest. Re-vendoring from
 * the registry drops this; put it back.
 */
function TableHead({ className, ...props }: React.ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCell({ className, ...props }: React.ComponentProps<"td">) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-2 align-middle whitespace-nowrap [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",
        className,
      )}
      {...props}
    />
  );
}

function TableCaption({ className, ...props }: React.ComponentProps<"caption">) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-muted-foreground", className)}
      {...props}
    />
  );
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption };
