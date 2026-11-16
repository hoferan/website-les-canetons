// What the history page and its editor panel both name. Apart from the
// panel, which is loaded in edit mode only (#396).

/** Which entry the panel is open on: a new one, or a stored one by id. */
export type HistoryOpened = { kind: "new" } | { kind: "edit"; id: number };

/** What the open panel's element on the page is found by (`EditorPanel`'s `target`). */
export const historyEditTarget = (opened: HistoryOpened) =>
  opened.kind === "new" ? "history/new" : `history/${opened.id}`;

/** Marks the panel's ⋯, which focus goes back to when a delete asked from it is cancelled. */
export const PANEL_MENU = "history-panel-menu";
