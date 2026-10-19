# Deploy, promote and roll back

The runbook is [`staging/README.md`](../../staging/README.md). It has the
server layout, every flag and the recovery steps. This page is the short
version for the routine cases, with a link to the runbook section each time you
need more.

Three servers on `easy-hebergement.net`, one build for all of them:

| Environment | Gets a new version | Notes |
| --- | --- | --- |
| TEST | On every merge to `main`, once CI is green | Behind Basic Auth |
| QA | When you dispatch `Deploy QA` with a tag | Behind Basic Auth |
| PROD | When you dispatch `Deploy PROD` with a tag | Refuses a commit that is not the last one deployed to QA |

QA and PROD still run the old server-rendered site until their cutover. Until
then, read [the cutover trap](../traps.md#a-deploy-alone-does-not-turn-a-server-over--it-breaks-it)
before you deploy to either, and never run `npm run put-overlay:qa` or `:prod`
on its own.

## Ship a change to TEST

Merge the pull request. `ci.yml` builds, runs every check and deploys to TEST.
Then look at TEST in a browser, because a green run does not mean the page
works.

`GET /api/health` on the server tells you which commit is deployed, whether the
database answers and which migrations are pending. Anything but 200 means
unhealthy.

## Promote to QA, then PROD

1. In GitHub Actions, dispatch **Tag Release** on the commit you checked on
   TEST. With no input it tags it `YYYY-MM-DD-<short-sha>`, and does nothing if
   that commit already has a tag.
2. Dispatch **Deploy QA** and pick that tag in the ref selector. Do not type
   the ref.
3. Check QA.
4. Dispatch **Deploy PROD** with the same tag. It asks the GitHub Deployments
   API whether that commit is the last successful QA deployment, and refuses if
   not.

Each deploy workflow has a `dry_run` input. There is no reviewer gate:
dispatching is the decision.

## Roll back

Dispatch the deploy workflow again with an older tag. There is no other
rollback.

A migration does not roll back with the code. The older code runs against the
newer schema, which is why every migration has to be backward compatible (see
[Write a migration](migrations.md)).

## Deploy from your machine

For when CI is down, or for a first deploy to a new server:

```bash
npm run status:test                 # what is deployed, no build
npm run deploy:test -- --dry-run    # the whole plan, nothing changed
npm run deploy:test
```

Use these scripts, never `node tools/deploy/cli.mjs` directly. FTP credentials
come from a git-ignored `.env.test` (or `.env.qa`, `.env.prod`); `.env.example`
lists the keys. Always `--dry-run` the first deploy to a new environment.

The deploy mirrors `dist/build/` onto the server: it uploads changed files and
deletes the ones the build no longer has. It never touches the five
server-owned files: `.htaccess`, `robots.txt`, `.htpasswd`, `config.php` and
`_api/.env`.

## When the deploy refuses

Exit code 2 means a guard refused before anything was uploaded. The message
names the guard.

**The `.env` shape check.** Before uploading, the deploy reads the server's
`_api/.env` and compares its keys (never its values) with `api/.env.example`.
A key missing on either side refuses the deploy:

```
FAILED at Preflight: TEST's _api/.env has drifted from api/.env.example
    _api/.env on TEST is MISSING key: SOME_NEW_FLAG
```

Edit that server's `_api/.env` by hand over FTP, add the key with the right
value for that server, and run the deploy again. Do the same on QA and PROD
before their next deploy.

This is why a pull request that adds a key to `api/.env.example` creates work
on every server. If the setting has a sensible default, put it in
`api/config/*.php` and leave it out of `.env.example`. See
[the shape check](../../staging/README.md#the-shape-check).

**The mass-delete brake.** The deploy stops when it would delete more than 50
files and more than 20% of the server's tree. Read the dry-run plan. If those
deletions are what you want, pass `--force-delete`.

**The wrong folder.** One FTP account reaches all three servers, so the deploy
refuses unless `FTP_DIR` names the environment you asked for.

**PROD before QA.** Deploy the tag to QA first.

## When the site is down after a deploy

Every `/api/*` request answering 503, and the SPA showing only "Le site n’a pas
pu démarrer", means a migration failed. It retries on every request. Follow
[Migrations and recovery](../../staging/README.md#migrations-and-recovery):
read the error with `npm run dbmigrate:<env> -- --dry-run`, set
`AUTO_MIGRATE=false` in that server's `_api/.env` to bring the site back, fix
the migration, deploy, migrate, and set `AUTO_MIGRATE=true` again.

A 500 on every `/api/*` request usually means `_api/.env` is missing or wrong.
See [Laravel's server-side `.env`](../../staging/README.md#laravels-server-side-env).
