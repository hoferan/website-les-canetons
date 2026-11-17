import * as React from "react";
import type { LucideIcon } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../../primitives/dropdown-menu";

export type ActionBarMenuItem = {
  id: string;
  label: string;
  icon?: LucideIcon;
  onSelect: () => void;
  /** Red, and set apart from the items above it by a rule. */
  destructive?: boolean;
};

/**
 * An action's ⋯ menu, around the action's own button. In a chunk of its own:
 * a bar shows only to an editor, and the menu brings Radix's menu and its
 * positioning, which a page's visitor would otherwise download for nothing.
 */
export function ActionMenu({
  items,
  children,
}: {
  items: ActionBarMenuItem[];
  /** The action's button, which opens the menu. */
  children: React.ReactElement;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item, n) => {
          const Glyph = item.icon;
          return (
            <React.Fragment key={item.id}>
              {item.destructive && n > 0 && !items[n - 1]?.destructive ? (
                <DropdownMenuSeparator />
              ) : null}
              <DropdownMenuItem destructive={item.destructive} onSelect={item.onSelect}>
                {Glyph ? <Glyph aria-hidden="true" /> : null}
                {item.label}
              </DropdownMenuItem>
            </React.Fragment>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
