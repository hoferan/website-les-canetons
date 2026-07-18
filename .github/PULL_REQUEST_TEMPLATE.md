## Summary

<!-- What does this PR change, and why? -->

## Related issues

<!-- Use a closing keyword (Closes/Fixes/Resolves #123) so the issue auto-closes when this PR merges. Delete this section if not applicable. -->

## Changes

-

## Testing

- [ ] `npm run check` passes locally
- [ ] Verified in local Docker (`docker compose up`) where relevant

## Config & secrets safety

- [ ] No real credentials committed (`config.php` stays git-ignored)
- [ ] No production data / DB dumps committed
- [ ] `app/` contains only files meant to be deployed via FTP (as `public/`, via `npm run build`)
