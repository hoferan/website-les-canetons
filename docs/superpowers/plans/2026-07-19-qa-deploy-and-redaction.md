# QA Deploy + Staging-Config Redaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a QA deploy path (local `deploy:qa` + a manual CI workflow that promotes the latest green-`main` commit) and redact hosting-internal identifiers from tracked files.

**Architecture:** Generalize the TEST-only FTP deploy script into one target-parameterized `tools/deploy.mjs <test|qa>`. Add a manual `deploy-qa.yml` workflow that resolves the commit of the latest successful TEST deploy, checks it out, builds, and FTP-uploads to QA. Redact the account name / absolute paths / staging hostnames from tracked files; the one functionally-required absolute path (`AuthUserFile`) becomes a `__HTPASSWD_PATH__` token substituted at `build:overlay` time from a git-ignored `.env` var.

**Tech Stack:** Node ESM tooling scripts (`basic-ftp`), GitHub Actions, Apache `.htaccess`, no bundler. No JS test harness exists — each task is verified with `--dry-run` output, `build:overlay` output, `grep` assertions, and `npm run check`.

## Global Constraints

- **English everywhere**; French only for on-screen UI text. Specs/plans/code/comments/identifiers in English.
- **Keep** the provider name `easy-hebergement` / `easy-hebergement.net`.
- **Keep** all public-page PII in `app/pages/*` (`comite@lescanetons.org`, member names, phone numbers) — it is intentionally published.
- **Keep** Docker/dev values: container path `/var/www/html`, dev DB user/pass `canetons`, DB names `lescanetons` / `lescanetons_test`.
- **Redact** (replace with placeholders): hosting account name `<account>` → `<account>`; absolute server paths under `<abs-server-path>/...` → generic placeholder; staging hostnames `<test-host>` → `<test-host>`, `<qa-host>` → `<qa-host>`.
- **Working tree only** — no git-history rewrite.
- Deploy scripts keep the per-target safety guard: the target dir must contain the env name, or the script refuses to run (this FTP account can also reach prod).
- Placeholder conventions: `<account>`, `<test-host>`, `<qa-host>`, `__HTPASSWD_PATH__`.

---

## Preconditions (branching)

The working tree currently holds unrelated uncommitted changes (the `returnTo` fix, the PHP 8.4 sync, the README deploy badge). Decide with the maintainer how to sequence those before starting (they likely belong on their own branch/PR). This plan's tasks assume a dedicated feature branch off `main`, e.g. `feat/qa-deploy`.

---

### Task 1: Shared `.env` loader + `AuthUserFile` token substitution

Introduce the `__HTPASSWD_PATH__` mechanism so the real absolute `.htpasswd` path leaves the repo. Extract the `.env` loader now shared by two scripts.

**Files:**
- Create: `tools/dotenv.mjs`
- Modify: `tools/build-overlays.mjs:13-39`
- Modify: `staging/test/.htaccess:1-18`, `staging/qa/.htaccess:1-18`
- Modify: `.env.example` (full rewrite)

**Interfaces:**
- Produces: `loadDotEnv(file = '.env'): void` in `tools/dotenv.mjs` — reads `KEY=VALUE` lines into `process.env` without overwriting already-set vars. Consumed here and by `tools/deploy.mjs` in Task 2.

- [ ] **Step 1: Create `tools/dotenv.mjs`**

```js
// Minimal .env loader (no dependency): reads KEY=VALUE lines from a git-ignored
// .env into process.env without overwriting already-set vars. Shared by the
// deploy script (tools/deploy.mjs) and the overlay builder (build-overlays.mjs).
import { existsSync, readFileSync } from 'node:fs';

export function loadDotEnv(file = '.env') {
  if (!existsSync(file)) {
    return;
  }
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (line.trimStart().startsWith('#')) {
      continue;
    }
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m) {
      continue;
    }
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}
```

- [ ] **Step 2: Tokenize `staging/test/.htaccess`**

Replace lines 12-18 (the two NOTE comments + directives). Old lines 12-13 and 18:

```apache
# NOTE: AuthUserFile requires an ABSOLUTE server path, which differs per host.
#       Absolute path confirmed on easy-hebergement.net (2026-07-18).
```
```apache
AuthUserFile "/absolute/server/path/to/<test-host>/.htpasswd"
```

New — comment lines 12-13:

```apache
# NOTE: AuthUserFile needs an ABSOLUTE server path (host-specific). The real
#       path is injected from HTPASSWD_PATH_TEST (.env) by build-overlays.mjs,
#       replacing the __HTPASSWD_PATH__ token below — see staging/README.md.
```

New — directive line 18:

```apache
AuthUserFile "__HTPASSWD_PATH__"
```

Also change the header comment on line 2 from `# TEST / staging site (<test-host>) — access control` to:

```apache
# TEST / staging site (<test-host>) — access control
```

- [ ] **Step 3: Tokenize `staging/qa/.htaccess`**

Identical edits, QA variant. Comment lines 12-13 use `HTPASSWD_PATH_QA`; line 18 → `AuthUserFile "__HTPASSWD_PATH__"`; header line 2 → `# QA / staging site (<qa-host>) — access control`.

- [ ] **Step 4: Substitute the token in `tools/build-overlays.mjs`**

After the imports (line 13), add:

```js
import { loadDotEnv } from './dotenv.mjs';

loadDotEnv();
```

Replace `mergedHtaccess` (lines 28-39) with:

```js
/** test/qa .htaccess: auth overlay first, then the built front controller. */
function mergedHtaccess(env) {
  let auth = readFileSync(`staging/${env}/.htaccess`, 'utf8').trimEnd();
  if (auth.includes('__HTPASSWD_PATH__')) {
    const pathVar = `HTPASSWD_PATH_${env.toUpperCase()}`;
    const real = process.env[pathVar];
    if (real) {
      auth = auth.split('__HTPASSWD_PATH__').join(real);
    } else {
      console.warn(
        `  ! ${pathVar} not set — leaving __HTPASSWD_PATH__ placeholder in ` +
          `${env}/.htaccess (set it in .env, or fill the path on the server).`
      );
    }
  }
  return (
    `${auth}\n\n` +
    '# ---------------------------------------------------------------------------\n' +
    '# Front controller + cache policy (generated from app/.htaccess by\n' +
    '# tools/build-overlays.mjs — do not edit here; edit app/.htaccess)\n' +
    '# ---------------------------------------------------------------------------\n' +
    `${frontController}\n`
  );
}
```

- [ ] **Step 5: Rewrite `.env.example`**

```bash
# FTP + staging settings for `npm run deploy:test` and `npm run deploy:qa`.
# Copy to `.env` (git-ignored) and fill in the real values. Plain FTP.
#
# FTP_TEST_DIR / FTP_QA_DIR: the remote docroot for each staging site, relative
# to the FTP user's home (whatever your FTP client shows as the folder path).
# Each MUST contain its env name ("test" / "qa"): the deploy script refuses any
# other path, so this account — which can also reach prod — can never deploy to
# the wrong place.
#   FTP_TEST_DIR=/path/to/<test-host>
#   FTP_QA_DIR=/path/to/<qa-host>
#
# HTPASSWD_PATH_TEST / HTPASSWD_PATH_QA: the ABSOLUTE server path to each staging
# site's .htpasswd. `npm run build:overlay` injects these into the generated
# .htaccess (replacing the __HTPASSWD_PATH__ token). Host-specific.
#   HTPASSWD_PATH_TEST=/absolute/server/path/to/<test-host>/.htpasswd

FTP_HOST=CHANGE_ME
FTP_USER=CHANGE_ME
FTP_PASS=CHANGE_ME
FTP_TEST_DIR=CHANGE_ME
FTP_QA_DIR=CHANGE_ME
HTPASSWD_PATH_TEST=CHANGE_ME
HTPASSWD_PATH_QA=CHANGE_ME
```

- [ ] **Step 6: Verify substitution both ways**

Run (no var set):
```bash
npm run build:overlay -- test
```
Expected: a `! HTPASSWD_PATH_TEST not set …` warning, and `dist/overlay/test/.htaccess` still contains `__HTPASSWD_PATH__`.

Run (var set):
```bash
HTPASSWD_PATH_TEST=/tmp/x/.htpasswd npm run build:overlay -- test
grep -c '__HTPASSWD_PATH__' dist/overlay/test/.htaccess   # expected: 0
grep -c '/tmp/x/.htpasswd' dist/overlay/test/.htaccess     # expected: 1
```
Expected: no warning; token replaced by the path.

- [ ] **Step 7: Commit**

```bash
git add tools/dotenv.mjs tools/build-overlays.mjs staging/test/.htaccess staging/qa/.htaccess .env.example
git commit -m "refactor: inject AuthUserFile path from .env; redact absolute path from staging config"
```

---

### Task 2: Parameterized `deploy.mjs` + `deploy:qa` script

**Files:**
- Rename+modify: `tools/deploy-test.mjs` → `tools/deploy.mjs`
- Modify: `package.json:9-10` (the `deploy:test` script; add `deploy:qa`)

**Interfaces:**
- Consumes: `loadDotEnv` from `tools/dotenv.mjs` (Task 1).
- CLI: `node tools/deploy.mjs <test|qa> [--dry-run] [--prune] [--force]`.

- [ ] **Step 1: Rename the file**

```bash
git mv tools/deploy-test.mjs tools/deploy.mjs
```

- [ ] **Step 2: Generalize the header + target handling**

Replace the top-of-file comment and the arg/`.env`/dir/guard blocks. Replace the old header comment block (lines 1-16) opening with a target-aware version, then replace lines 17-53 and 121-132. Concretely:

Replace the local `loadDotEnv` (old lines 31-53) with an import at the top of the file (just after the existing `import ftp ...` / `node:fs` / `node:path` imports):

```js
import { loadDotEnv } from './dotenv.mjs';
```

Replace the args block (old lines 26-29) with:

```js
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const PRUNE = args.includes('--prune');
const FORCE = args.includes('--force');

// First non-flag arg selects the target environment.
const TARGETS = {
  test: { dirVar: 'FTP_TEST_DIR', guard: /(^|[/.])test([/.]|$)/i },
  qa: { dirVar: 'FTP_QA_DIR', guard: /(^|[/.])qa([/.]|$)/i },
};
const target = args.find((a) => !a.startsWith('--'));
if (!target || !TARGETS[target]) {
  console.error(`Usage: node tools/deploy.mjs <${Object.keys(TARGETS).join('|')}> [--dry-run] [--prune] [--force]`);
  process.exit(1);
}
const { dirVar, guard } = TARGETS[target];
const LABEL = target.toUpperCase();
```

Delete the old `loadDotEnv` function definition entirely (it now lives in `dotenv.mjs`).

- [ ] **Step 3: Use the target in `main()`**

In `main()`, the log line (old line 102) becomes:
```js
  console.log(`${LABEL} deploy — ${local.length} files in ${LOCAL_ROOT}/`);
```

The missing-vars check (old line 106) uses the target dir var:
```js
  const missing = ['FTP_HOST', 'FTP_USER', 'FTP_PASS', dirVar].filter((k) => !process.env[k]);
```

Replace the destructure + guard (old lines 121-132) with:
```js
  const { FTP_HOST } = process.env;
  const remoteRoot = process.env[dirVar];

  // Safety: this FTP account can also write qa and prod. Refuse unless the
  // target path clearly points at the intended env, so a mistyped dir can never
  // deploy to — or --prune! — the wrong environment.
  if (!guard.test(remoteRoot)) {
    console.error(`\nRefusing to run: ${dirVar}="${remoteRoot}" does not look like the ${LABEL} target.`);
    console.error(`This account can reach other environments too, so deploy only runs against a path matching "${target}".`);
    process.exit(1);
  }

  console.log(`  target: ${FTP_HOST} ${remoteRoot}\n`);
```

Then replace every remaining `FTP_TEST_DIR` reference in `main()` (the `ensureDir`, `listRemote`, upload `remoteDir`, and prune `remove` calls — old lines 137, 139, 191, 204) with `remoteRoot`.

- [ ] **Step 4: Update `package.json`**

Old (lines 9-10):
```json
    "deploy:test": "npm run build && node tools/deploy-test.mjs",
```
New:
```json
    "deploy:test": "npm run build && node tools/deploy.mjs test",
    "deploy:qa": "npm run build && node tools/deploy.mjs qa",
```

- [ ] **Step 5: Verify guard, usage, and lint**

```bash
node tools/deploy.mjs                     # expected: Usage line, exit 1
FTP_QA_DIR=/wrong/path node tools/deploy.mjs qa   # expected: "Refusing to run … qa"
npm run lint:js                           # expected: clean
```
(Full FTP upload is exercised manually with a real `.env`.)

- [ ] **Step 6: Commit**

```bash
git add tools/deploy.mjs package.json
git commit -m "feat(deploy): parameterize deploy script by target; add deploy:qa"
```

---

### Task 3: Manual QA-deploy CI workflow

**Files:**
- Create: `.github/workflows/deploy-qa.yml`

- [ ] **Step 1: Write the workflow**

```yaml
name: Deploy QA

# Manually promote the exact commit currently on TEST (the latest green main CI
# run) to the QA staging site. Manual-only, and only meaningful once a TEST
# deploy has succeeded — otherwise there is no commit to promote. qa/prod are
# never auto-deployed.
on:
  workflow_dispatch:

permissions:
  contents: read
  actions: read

jobs:
  deploy-qa:
    runs-on: ubuntu-latest
    environment: qa
    concurrency:
      group: deploy-qa
      cancel-in-progress: false
    steps:
      - name: Resolve the latest successfully-deployed TEST commit
        id: promote
        env:
          GH_TOKEN: ${{ github.token }}
        run: |
          sha=$(gh run list --repo "$GITHUB_REPOSITORY" \
            --workflow=ci.yml --branch=main --event=push --status=success \
            --limit=1 --json headSha --jq '.[0].headSha')
          if [ -z "$sha" ]; then
            echo "::error::No successful TEST deploy found to promote."
            exit 1
          fi
          echo "Promoting commit $sha to QA."
          echo "sha=$sha" >> "$GITHUB_OUTPUT"
      - uses: actions/checkout@v4
        with:
          ref: ${{ steps.promote.outputs.sha }}
      - uses: actions/setup-node@v4
        with:
          node-version: "20"
      - name: Install Node dev tools
        run: npm ci
      - name: Build + deploy to QA over FTP
        env:
          FTP_HOST: ${{ secrets.FTP_HOST }}
          FTP_USER: ${{ secrets.FTP_USER }}
          FTP_PASS: ${{ secrets.FTP_PASS }}
          FTP_QA_DIR: ${{ secrets.FTP_QA_DIR }}
        run: npm run deploy:qa
```

- [ ] **Step 2: Verify YAML validity**

Run:
```bash
node -e "const s=require('fs').readFileSync('.github/workflows/deploy-qa.yml','utf8'); if(!/workflow_dispatch/.test(s)||!/environment: qa/.test(s)||!/npm run deploy:qa/.test(s)) throw new Error('deploy-qa.yml missing a required element'); console.log('deploy-qa.yml looks structurally valid')"
```
Expected: `deploy-qa.yml looks structurally valid`. (The full run is validated on the first manual dispatch, once the `qa` environment secrets exist.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-qa.yml
git commit -m "ci: add manual deploy-qa workflow promoting the latest green TEST commit"
```

---

### Task 4: Docs — CLAUDE.md deploy section + staging/README.md redaction

**Files:**
- Modify: `CLAUDE.md` (deploy section + Development Commands)
- Modify: `staging/README.md`

- [ ] **Step 1: Document `deploy:qa` in CLAUDE.md**

In the "Automated TEST deploy" bullet, the script is no longer TEST-only. After that paragraph, add a sentence and a QA bullet. Add to the CLAUDE.md deployment section:

```markdown
- **QA deploy:** `npm run deploy:qa` builds and uploads `public/` to the QA
  server (creds from `.env`, `FTP_QA_DIR`; same `deploy.mjs` as TEST, with a
  `qa`-path guard). In CI, QA is a **manual** promotion: the `deploy-qa.yml`
  workflow (`workflow_dispatch`) resolves the commit of the latest green `main`
  run — i.e. what is currently on TEST — checks it out, builds, and uploads to
  QA. Requires the same four FTP secrets on a `qa` GitHub Environment. prod
  stays a manual WinSCP promotion.
```

Also update the Development Commands list to mention `deploy:qa` beside `deploy:test` if `deploy:test` is listed there.

- [ ] **Step 2: Redact hostnames + path in staging/README.md**

Global replacements across `staging/README.md`:
- `<test-host>` → `<test-host>`
- `<qa-host>` → `<qa-host>`
- `/absolute/server/path/to/<host>/.htpasswd` → `/absolute/server/path/to/<host>/.htpasswd`

Run:
```bash
sed -i 's#<test-host>#<test-host>#g; s#<qa-host>#<qa-host>#g; s#/absolute/server/path/to/<host>/\.htpasswd#/absolute/server/path/to/<host>/.htpasswd#g' staging/README.md
```

- [ ] **Step 3: Document the token mechanism + `qa` environment in staging/README.md**

In the "Editing these files" section (the note about `AuthUserFile` being host-specific), replace the parenthetical that named the real absolute path with:

```markdown
When you change where `.htpasswd` lives, set the **absolute** server path in
`HTPASSWD_PATH_TEST` / `HTPASSWD_PATH_QA` (git-ignored `.env`); `build:overlay`
injects it into the generated `.htaccess` in place of the `__HTPASSWD_PATH__`
token. Nothing host-specific is committed.
```

Add a short subsection documenting the CI `qa` environment:

```markdown
## CI: QA deploy (manual)

`deploy-qa.yml` (Actions → "Deploy QA" → Run workflow) promotes the commit of
the latest green `main` run to QA. It needs a **`qa` GitHub Environment**
(Settings → Environments → `qa`) with `FTP_HOST`, `FTP_USER`, `FTP_PASS`,
`FTP_QA_DIR`; add a required-reviewer rule there for an extra gate. prod is never
deployed by CI.
```

- [ ] **Step 4: Verify these docs are clean**

```bash
grep -nE '<account>|<abs-server-path>|<test-host>|<qa-host>' CLAUDE.md staging/README.md
```
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md staging/README.md
git commit -m "docs: document deploy:qa + qa environment; redact staging host/path"
```

---

### Task 5: Repo-wide redaction verification + follow-up issue

**Files:** none modified (verification + issue creation).

- [ ] **Step 1: Assert zero redact-target matches across tracked files**

```bash
git ls-files | grep -vE '^(vendor/|package-lock.json|composer.lock)' \
  | xargs grep -nEI '<account>|<abs-server-path>|<test-host>|<qa-host>' 2>/dev/null \
  | grep -avE '\.(jpg|jpeg|png|gif|ico)$' \
  || echo "CLEAN: no redact-target strings remain"
```
Expected: `CLEAN: no redact-target strings remain`. (This also covers `docs/superpowers/` — confirming the historical docs hold none of the redact-targets.)

- [ ] **Step 2: Confirm the keep-list is intact**

```bash
grep -rl 'easy-hebergement' CLAUDE.md README.md staging/README.md >/dev/null && echo "provider name kept: OK"
grep -q 'comite@lescanetons.org' app/pages/comite_teamdirection.php && echo "public email kept: OK"
```
Expected: both `OK` lines.

- [ ] **Step 3: File the follow-up issue**

```bash
gh issue create \
  --title "ci: auto-deploy to QA after e2e tests pass on TEST" \
  --body "Once Playwright e2e coverage (#14) runs against the TEST site after each deploy, automatically promote that commit to QA instead of requiring the manual \`deploy-qa.yml\` dispatch.

**Depends on:** #14 (Playwright e2e coverage for critical flows).

**Building block:** the manual \`deploy-qa.yml\` workflow already promotes the latest green \`main\` commit to QA; this issue is to trigger it (or an equivalent job) automatically on a green post-TEST e2e run rather than by hand.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```
Expected: prints the new issue URL.

- [ ] **Step 4: (Maintainer, manual — not a code step)**

Create the `qa` GitHub Environment with `FTP_HOST`, `FTP_USER`, `FTP_PASS`, `FTP_QA_DIR`; set `HTPASSWD_PATH_TEST` / `HTPASSWD_PATH_QA` in the local `.env`. Then a first manual "Deploy QA" dispatch validates the workflow end-to-end.

---

## Self-Review Notes

- **Spec coverage:** Part A §3.1 → Task 2; §3.2 → Task 3; §3.3 → Task 4 Step 3 + Task 5 Step 4; §3.4 → Task 5 Step 3. Part B §4.1 redaction → Tasks 1, 4 (living files; §4.4 historical confirmed empty via Task 5 Step 1); §4.2 AuthUserFile token → Task 1; §4.5 verification → Task 5. Testing §5 → per-task verify steps.
- **Placeholders:** none — every code/edit step carries the actual content.
- **Type consistency:** `loadDotEnv` signature identical across `dotenv.mjs`, `build-overlays.mjs`, `deploy.mjs`; the `__HTPASSWD_PATH__` token and `HTPASSWD_PATH_<ENV>` var names match across `.htaccess`, `build-overlays.mjs`, `.env.example`, and docs.
