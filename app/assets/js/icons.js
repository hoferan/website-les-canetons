// icons.js — the small, fixed set of Lucide icons used across the site (see
// CLAUDE.md's Icons section). Shared here so main.js (initial page load) and
// planning_repet.js (re-init after the admin event list rebuilds) initialize
// from the same icon set — add a new icon here, not per call site.
import { ExternalLink, Menu, Pencil, Trash2 } from 'lucide';

export const icons = { ExternalLink, Menu, Pencil, Trash2 };
