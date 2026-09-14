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
     seam this PR crossed really connects. Five rules, each one learned the
     expensive way on PR #82:

     1. WALK THE LIST YOURSELF FIRST, ON THE STACK YOU NAMED. Three steps on
        that PR were impossible as written — a control that was never rendered,
        a checkbox under the wrong label, a login that exists only in the
        mocked backend — and every one came from writing the step out of the
        source instead of off the screen. Opening the page is the difference.
     2. SAY WHERE, WITH WHICH LOGIN, AND WHAT THE DATA DOES NOT HAVE, before
        the first box. The two stacks have DIFFERENT accounts: `npm run dev`
        has what DevSeeder and the bootstrap migration create, the mocked one
        (`npm run dev:mock`) has its own session fixtures, and neither list is
        a superset of the other. A reviewer whose database has no public event
        reads an empty page as a bug and stops.
     3. PREFER A ROUND TRIP OVER A TOUR. "Untick this, watch that page change,
        tick it back" proves the seam. "Open these six pages" proves they
        render, which the suite already knew.
     4. NAME CONTROLS EXACTLY AS THEY ARE LABELLED ON SCREEN, in the UI's own
        French — and read the label off the rendered page, not out of
        `web/src/i18n/fr.ts`, which carries the names used in error messages
        and not always the ones on the controls.
     5. INCLUDE WHAT MUST NOT HAPPEN. The interesting half is usually the
        absence: a name that must not appear, a page that must still refuse. -->

**Where:** <!-- e.g. `npm run build && npm run dev`, then http://localhost:5173 -->

**Logins:** <!-- which accounts, which passwords, and on which of the two stacks each one exists -->

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
