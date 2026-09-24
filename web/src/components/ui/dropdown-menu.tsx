import * as React from "react";
import { DropdownMenu as DropdownMenuPrimitive } from "radix-ui";

import { cn } from "@/lib/utils";

/**
 * VENDORED from shadcn/ui and trimmed, the same way ui/alert-dialog.tsx is.
 *
 * SIX PARTS AND NO MORE. No submenus, no checkbox or radio items, no groups,
 * no labels: each is a surface that has to keep working across three screens
 * and two catalogues, and none of them is needed today. A later screen that
 * wants one adds it then.
 *
 * NO `dark:` UTILITY, for the reason ui/button.tsx sets out at length: this
 * app declares no `dark` custom variant, so Tailwind 4 compiles one to a
 * prefers-color-scheme media query that fires on any phone set to dark.
 *
 * `modal` DEFAULTS TO FALSE HERE, unlike Radix. A menu of four items over a
 * card has no reason to mark the rest of the page aria-hidden (hideOthers),
 * mount a second RemoveScroll, or add a second focus trap and a second entry
 * to DismissableLayer's body-lock refcount — all of which the modal branch
 * does, and all of which have to unwind in the right order around the
 * AlertDialog these menus open. It is NOT a fix for a focus bug: the design
 * measured that path and there is no bug. See §3 of the spec.
 */
function DropdownMenu({
  modal = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Root>) {
  return <DropdownMenuPrimitive.Root data-slot="dropdown-menu" modal={modal} {...props} />;
}

function DropdownMenuTrigger({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Trigger>) {
  return <DropdownMenuPrimitive.Trigger data-slot="dropdown-menu-trigger" {...props} />;
}

function DropdownMenuPortal({
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Portal>) {
  return <DropdownMenuPrimitive.Portal data-slot="dropdown-menu-portal" {...props} />;
}

function DropdownMenuContent({
  className,
  sideOffset = 4,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Content>) {
  return (
    <DropdownMenuPortal>
      <DropdownMenuPrimitive.Content
        data-slot="dropdown-menu-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 min-w-[12rem] overflow-hidden rounded-lg border border-line bg-panel p-1.5 text-ink shadow-lg data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0",
          className,
        )}
        {...props}
      />
    </DropdownMenuPortal>
  );
}

function DropdownMenuItem({
  className,
  destructive = false,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }) {
  return (
    <DropdownMenuPrimitive.Item
      data-slot="dropdown-menu-item"
      data-destructive={destructive || undefined}
      className={cn(
        // min-h-touch, not a height: the 44px floor is the same one
        // ui/button.tsx puts on every control, and a menu item is a control.
        //
        // Focus is a violet tint, the nav's own accent, and Radix moves focus
        // with the pointer, so this is the hover state too. A destructive item
        // stays red on focus rather than turning violet.
        "relative flex min-h-touch cursor-default items-center gap-3 rounded-md px-2.5 py-1.5 text-sm text-ink outline-none select-none focus:bg-violet/10 focus:text-violet data-[destructive]:text-danger data-[destructive]:focus:bg-danger/10 data-[destructive]:focus:text-danger data-[disabled]:pointer-events-none data-[disabled]:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
        className,
      )}
      {...props}
    />
  );
}

function DropdownMenuSeparator({
  className,
  ...props
}: React.ComponentProps<typeof DropdownMenuPrimitive.Separator>) {
  return (
    <DropdownMenuPrimitive.Separator
      data-slot="dropdown-menu-separator"
      className={cn("-mx-1.5 my-1.5 h-px bg-line", className)}
      {...props}
    />
  );
}

export {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuPortal,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
};
