import { screen, within } from "@testing-library/react";
import type { UserEvent } from "@testing-library/user-event";

/**
 * A line of a block's editor wears the action bar's row look (ADR 0043):
 * ↑ ↓ and a ⋯ that holds Dupliquer and Supprimer. These click through the ⋯.
 */
async function fromMenu(user: UserEvent, line: HTMLElement, item: string) {
  await user.click(within(line).getByRole("button", { name: "Plus d’actions" }));
  await user.click(await screen.findByRole("menuitem", { name: item }));
}

/** Deletes `line` from its list, in the form only. */
export const removeLine = (user: UserEvent, line: HTMLElement) =>
  fromMenu(user, line, "Supprimer la ligne");

/** Puts a copy of `line` right after it, in the form only. */
export const duplicateLine = (user: UserEvent, line: HTMLElement) =>
  fromMenu(user, line, "Dupliquer la ligne");
