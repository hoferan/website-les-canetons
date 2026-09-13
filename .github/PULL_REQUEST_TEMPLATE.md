## Summary

<!-- What does this PR change, and why? -->

## Related issues

<!-- Use a closing keyword (Closes/Fixes/Resolves #123) so the issue auto-closes when this PR merges. Delete this section if not applicable. -->

## Changes

-

## Manual verification

<!-- FOR ANYTHING WITH A VISIBLE SURFACE. Delete this whole section if the PR
     has none (tooling, config, a refactor behind unchanged behaviour).

     This is not a second copy of the automated tests. It is for what a green
     suite cannot say: whether the thing is actually usable, and whether the
     seam this PR crossed really connects. Four rules, each one learned here:

     1. SAY WHERE, AND WHAT THE LOCAL DATA DOES NOT HAVE, before the first box.
        A reviewer whose seeded database has no public event will read an empty
        page as a bug and stop.
     2. PREFER A ROUND TRIP OVER A TOUR. "Untick this, watch that page change,
        tick it back" proves the seam. "Open these six pages" proves they render,
        which the suite already knew.
     3. NAME CONTROLS EXACTLY AS THEY ARE LABELLED ON SCREEN, in the UI's own
        French. A reviewer should never have to guess which checkbox you mean.
     4. INCLUDE WHAT MUST NOT HAPPEN. The interesting half is usually the
        absence: a name that must not appear, a page that must still refuse. -->

**Where:** <!-- e.g. `npm run build && npm run dev`, then http://localhost:5173 -->

**What the seeded data does not have:** <!-- ...so the first empty screen is not read as a defect -->

- [ ]

## Testing

- [ ] `npm run check` passes locally
- [ ] The Laravel suite passes in Docker (`docker compose exec -w /var/www/html/_api web php artisan test`) — API changes only
- [ ] Verified in local Docker (`npm run dev`) where relevant

## Config & secrets safety

- [ ] No real credentials committed (`api/.env` and `.env.*` stay git-ignored)
- [ ] No production data / DB dumps committed
- [ ] No new key in `api/.env.example` without a matching hand-edit on every server — the deploy pre-flight refuses on drift in either direction
