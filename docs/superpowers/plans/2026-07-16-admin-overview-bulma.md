# Admin Overview — Bulma Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adopt Bulma (vendored, buildless) as a reusable CSS foundation and use it to improve the admin signups overview (`signups_admin.php`), scoped to that one page so the rest of the site is unchanged.

**Architecture:** Buildless PHP 8.1 site. A single precompiled `bulma.min.css` is vendored under `code/assets/vendor/` and referenced only by `signups_admin.css` (import order: Bulma → `main.css` → admin overrides), so Bulma styles the admin page only. The overview keeps its server-rendered shell + JS-filled body; the JS emits Bulma classes. Bulma is themed to the duck-amber identity via CSS custom properties.

**Tech Stack:** PHP 8.1, vanilla JS + CSS (no build step), Bulma 1.x (vendored static CSS), Docker for local dev + Dockerized PHP tooling.

## Global Constraints

- **Buildless:** no build step for the deployed site; edit JS/CSS in place; deploy `code/` as-is. Third-party CSS may be **vendored** as a static file (no CDN, no bundler).
- **`code/` is the FTP payload** — the vendored file lives at `code/assets/vendor/` (still shipped); dev-only config (`.prettierignore`) stays at the repo root.
- **Scope:** Bulma loads **only** on `signups_admin.php`. No other page may change appearance. The public signup flow and the JSON/CSV API are untouched.
- **Language:** English everywhere except user-visible UI text (French).
- **Menu palette (reused verbatim):** meat `#9c3c17`, child `#23577f`, vegetarian `#2f6b3c`; accent duck-amber `#e7a11c`, deep amber `#b9760d`, amber-invert `#241a05`.
- **Verify before pushing:** `npm run check` (php -l, phpcs PSR-12, PHPUnit, eslint, stylelint, prettier, secret-guard) must pass, and Prettier/Stylelint must **not** touch the vendored file.

## Testing approach

No unit tests (CSS/UI change). Verification = `npm run check` green + manual browser checks:
the admin page (as `demo.admin`) looks improved, and **other pages are visually unchanged**
(Bulma isn't loaded there). Local site: `docker compose up -d` → http://localhost:8090.
Network is available in this environment (Docker images were pulled earlier), so fetching the
vendored Bulma file via `curl` works.

## File Structure

**Created**
- `code/assets/vendor/bulma.min.css` — vendored Bulma 1.x (precompiled, shipped as-is).
- `code/assets/vendor/README.md` — provenance (source URL, exact version, refresh command).
- `.prettierignore` (repo root) — exclude `code/assets/vendor/` from Prettier.

**Modified**
- `code/assets/css/signups_admin.css` — imports (Bulma → main.css), theme vars, overrides.
- `code/signups_admin.php` — Bulma classes/structure in the static shell.
- `code/assets/js/signups_admin.js` — emit Bulma classes for the summary tiles.
- `CLAUDE.md` — constraint wording (no build step; vendoring allowed).

---

### Task 1: Vendor Bulma + tooling hygiene

**Files:**
- Create: `code/assets/vendor/bulma.min.css`
- Create: `code/assets/vendor/README.md`
- Create: `.prettierignore`
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: nothing.
- Produces: `code/assets/vendor/bulma.min.css` available to import in Task 2. No page references it yet, so this task is visually a no-op.

- [ ] **Step 1: Vendor the Bulma CSS file**

Download the pinned precompiled file (network is available):

```bash
mkdir -p code/assets/vendor
curl -fL https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css -o code/assets/vendor/bulma.min.css
```

Verify it looks like Bulma CSS (non-empty, contains Bulma tokens):

```bash
head -c 200 code/assets/vendor/bulma.min.css; echo; wc -c code/assets/vendor/bulma.min.css
grep -c -- "--bulma-" code/assets/vendor/bulma.min.css
```

Expected: a `/*! bulma.io v1.0.4 ...*/` banner near the top, size roughly 200–300 KB, and a non-zero count of `--bulma-` custom properties. If the download fails (no network), STOP and report BLOCKED.

- [ ] **Step 2: Document provenance**

Create `code/assets/vendor/README.md`:

```markdown
# Vendored third-party assets

Precompiled, shipped as-is (buildless — no build step). Do not hand-edit.

## bulma.min.css

- Library: Bulma (pure-CSS framework)
- Version: 1.0.4
- Source: https://cdn.jsdelivr.net/npm/bulma@1.0.4/css/bulma.min.css
- Used by: `code/assets/css/signups_admin.css` (admin overview only)

### Refresh

    curl -fL https://cdn.jsdelivr.net/npm/bulma@<version>/css/bulma.min.css \
      -o code/assets/vendor/bulma.min.css
```

- [ ] **Step 3: Exclude the vendored file from Prettier**

Create `.prettierignore` at the repo root:

```gitignore
# Vendored third-party assets are shipped as-is; never reformat them.
code/assets/vendor/
```

(Stylelint already scopes to `code/assets/css/**` and never sees `assets/vendor/`; ESLint scopes to `code/assets/js`.)

- [ ] **Step 4: Relax the CLAUDE.md constraint wording**

In `CLAUDE.md`, under **Tech Stack**, change the first bullet's "buildless — no framework, no bundler, no runtime dependencies" to:

```markdown
- **PHP 8.1** (matches prod: PHP 8.1.34), **buildless** — no bundler, no build step, no
  runtime dependencies. Third-party CSS may be **vendored** as a static file under
  `code/assets/vendor/` (no CDN, no build). Files are edited in place and deployed as-is.
```

Under **Don'ts**, change "Never introduce a runtime build step or framework for the deployed site." to:

```markdown
- Never introduce a build step or bundler for the deployed site. (A CSS framework may be
  used only as a **vendored static file** in `code/assets/vendor/` — no build, no CDN.)
```

- [ ] **Step 5: Verify the tooling ignores the vendored file**

Run: `npm run check`
Expected: all green. In particular `format:check` (Prettier) reports no issues on
`assets/vendor/bulma.min.css` (it is ignored), and Stylelint does not scan it. If Prettier
flags the vendored file, the `.prettierignore` path is wrong — fix it and re-run.

- [ ] **Step 6: Commit**

```bash
git add code/assets/vendor/bulma.min.css code/assets/vendor/README.md .prettierignore CLAUDE.md
git commit -m "chore(ui): vendor Bulma CSS (buildless) + tooling/constraint updates"
```

---

### Task 2: Restyle the admin overview with Bulma (scoped)

**Files:**
- Modify: `code/assets/css/signups_admin.css`
- Modify: `code/signups_admin.php`
- Modify: `code/assets/js/signups_admin.js`

**Interfaces:**
- Consumes: `code/assets/vendor/bulma.min.css` (Task 1); the `GET api/signups.php` JSON
  (unchanged): `{totalPersons,totalTables,menuTotals:{meat,child,vegetarian},tables:[{name,personCount,menuCounts,signups:[{first_name,last_name,address,phone,personCount,menuCounts}]}],occasion:{title,...}}`.
- Produces: the improved admin overview. No new API/JS contract.

- [ ] **Step 1: Rewrite the admin stylesheet (import order + theme + overrides)**

Replace the entire contents of `code/assets/css/signups_admin.css` with:

```css
@import url("../vendor/bulma.min.css");
@import url("main.css");

/* Theme Bulma to the Canetons identity. This stylesheet loads ONLY on the admin
   overview page, so a global :root override here does not affect other pages. */
:root {
  --bulma-primary: #e7a11c;
  --bulma-primary-invert: #241a05;
  --bulma-link: #b9760d;
}

.signups-admin .title {
  color: #2a2a2d;
}

.admin-head {
  margin-bottom: 22px;
}

/* -- SUMMARY TILES (Bulma columns + box) -- */

.tile-box {
  height: 100%;
  border-left: 5px solid #e7ded1;
}

.tile-k {
  margin-bottom: 4px;
  font-size: 12px;
  font-weight: bold;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #555;
}

.tile-v {
  font-size: 30px;
  font-weight: bold;
  line-height: 1.1;
}

.tile-box.accent {
  border-left-color: #e7a11c;
  background: #fbeecb;
}

.tile-box.menu-meat {
  border-left-color: #9c3c17;
  background: #f6ddd0;
}

.tile-box.menu-meat .tile-k {
  color: #7f3013;
}

.tile-box.menu-child {
  border-left-color: #23577f;
  background: #d8e6f4;
}

.tile-box.menu-child .tile-k {
  color: #1c4664;
}

.tile-box.menu-veg {
  border-left-color: #2f6b3c;
  background: #d8ebd9;
}

.tile-box.menu-veg .tile-k {
  color: #265630;
}

/* -- SIGNUPS TABLE (layered on Bulma .table) -- */

#signups-table {
  background: #fff;
}

#signups-table thead th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: #f1ece2;
  color: #555;
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  white-space: nowrap;
  border-bottom-width: 2px;
}

#signups-table th.num,
#signups-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}

#signups-table th.total,
#signups-table td.total {
  border-left: 1px solid #e0d6c7;
  font-weight: bold;
}

#signups-table td.zero {
  color: #bbb;
}

#signups-table .signup-row:hover td {
  background: #fdf6e9;
}

#signups-table .signup-row td:first-child {
  padding-left: 24px;
}

#signups-table .signup-row strong {
  color: #2a2a2d;
}

.contact-sub {
  margin-top: 2px;
  font-size: 12px;
  color: #888;
}

#signups-table .group-row td {
  background: #fbeecb;
  font-weight: bold;
  color: #5a4a1e;
}

#signups-table .group-row td:first-child {
  border-left: 5px solid #e7a11c;
}

#signups-table tfoot .group-row td {
  background: #f4e6c2;
  border-top: 2px solid #e0d6c7;
}

.dot {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin-right: 6px;
  border-radius: 50%;
  vertical-align: middle;
}

.dot-meat {
  background: #9c3c17;
}

.dot-child {
  background: #23577f;
}

.dot-veg {
  background: #2f6b3c;
}
```

- [ ] **Step 2: Update the admin page shell to Bulma structure**

Replace the `<section class="signups-admin"> … </section>` block in `code/signups_admin.php`
with (leave the PHP guard/head/partials and the script includes unchanged):

```php
<section class="signups-admin">
  <div class="level admin-head">
    <div class="level-left">
      <h1 class="title is-4" id="admin-title">Inscriptions</h1>
    </div>
    <div class="level-right">
      <a class="button is-primary is-light" href="api/signups.php?format=csv">
        ⬇ Exporter en CSV
      </a>
    </div>
  </div>

  <div class="columns is-multiline" id="tiles"></div>

  <div class="table-container">
    <table id="signups-table" class="table is-fullwidth is-hoverable">
      <caption class="is-sr-only">Inscriptions par table et par menu</caption>
      <thead>
        <tr>
          <th scope="col">Table / Contact</th>
          <th scope="col">Tél.</th>
          <th scope="col" class="num"><span class="dot dot-meat"></span>Viande</th>
          <th scope="col" class="num"><span class="dot dot-child"></span>Enfant</th>
          <th scope="col" class="num"><span class="dot dot-veg"></span>Végét.</th>
          <th scope="col" class="num total">Total</th>
        </tr>
      </thead>
      <tbody id="signups-body" aria-live="polite"></tbody>
      <tfoot id="signups-foot"></tfoot>
    </table>
  </div>
</section>
```

- [ ] **Step 3: Update the tiles renderer to emit Bulma columns/boxes**

In `code/assets/js/signups_admin.js`, replace the `tile(...)` function with the version below.
Everything else (fetch, `numCell`, `contactCell`, `menuRow`, `textCell`, group/`signup-row`
building, `tfoot`) stays exactly as-is — those classes are styled by Task 2 Step 1.

```javascript
function tile(label, value, cls) {
  var col = document.createElement("div");
  col.className = "column is-one-fifth-desktop is-half-tablet";
  var box = document.createElement("div");
  box.className = "box tile-box" + (cls ? " " + cls : "");
  var k = document.createElement("p");
  k.className = "tile-k";
  k.textContent = label;
  var v = document.createElement("p");
  v.className = "tile-v";
  v.textContent = value;
  box.appendChild(k);
  box.appendChild(v);
  col.appendChild(box);
  return col;
}
```

(The existing `render()` already appends five `tile(...)` results into `#tiles`; with `#tiles`
now a `.columns.is-multiline`, the boxes lay out as a responsive KPI row.)

- [ ] **Step 4: Lint**

Run: `npm run check`
Expected: all green (php -l, phpcs, PHPUnit 7/7, eslint, stylelint, prettier, secret-guard).
If Prettier reformats the edited JS/CSS, run `npm run fix` and re-run `npm run check`.

- [ ] **Step 5: Verify in the browser (as admin)**

`docker compose up -d` if needed. Log in at http://localhost:8090 as `demo.admin` / `demo`,
open `signups_admin.php`. Confirm:
- Tiles render as a clean KPI row (Total personnes/tables + three colour-coded menu tiles).
- The table uses Bulma styling (full width, row hover), solid white surface, right-aligned
  tabular numbers, muted "–" for zeros, distinct amber group rows + a grand-total footer.
- The CSV button is an amber Bulma button and still downloads `?format=csv`.
- The shared header/nav/footer and the outer card still look correct on this page.

- [ ] **Step 6: Verify OTHER pages are unchanged (regression)**

Confirm Bulma did not leak site-wide:

```bash
curl -s http://localhost:8090/index.php   | grep -c "bulma.min.css"   # expect 0
curl -s http://localhost:8090/contact.php | grep -c "bulma.min.css"   # expect 0
curl -s http://localhost:8090/signups_admin.php | grep -c "signups_admin.css"  # expect 1
```

Also open `index.php` and `contact.php` in the browser and confirm they look exactly as before.

- [ ] **Step 7: Verify responsive behavior**

Narrow the viewport (or devtools device mode): the tiles stack (two-up on tablet, stacked on
mobile) and the table scrolls horizontally inside `.table-container` — the page body itself
never scrolls sideways.

- [ ] **Step 8: Commit**

```bash
git add code/assets/css/signups_admin.css code/signups_admin.php code/assets/js/signups_admin.js
git commit -m "feat(admin): restyle signups overview with Bulma (scoped to admin page)"
```

---

## Final verification

- [ ] `npm run check` green.
- [ ] Admin overview improved (tiles + table) as admin; CSV works.
- [ ] `index.php` / `contact.php` visually unchanged; `grep` confirms Bulma is not referenced there.
- [ ] Vendored file untouched by Prettier/Stylelint; `.prettierignore` in place.
- [ ] Responsive: tiles stack, table scrolls within its container.

## Self-Review (completed during authoring)

- **Spec coverage:** vendored single Bulma file + tooling exclusions + CLAUDE.md wording (Task 1) ✓; scoped import order Bulma→main.css→overrides, admin-only (Task 2 Step 1) ✓; duck-amber theming via CSS vars (Task 2 Step 1) ✓; improved tiles (Bulma columns/box) + table (`is-fullwidth is-hoverable`, `.table-container`, sticky header, tabular-nums, muted zero, group rows + tfoot, white surface) + a11y (`scope`, sr-only caption, `aria-live`) + CSV as Bulma button (Task 2 Steps 2–3) ✓; regression + responsive checks (Task 2 Steps 6–7) ✓; English code / French UI, menu palette reused (all tasks) ✓.
- **Placeholder scan:** no TBD/TODO; every code step contains complete content.
- **Consistency:** selectors use `#signups-table`/`.signup-row`/`.group-row`/`.tile-box` consistently across the CSS (Task 2 Step 1), the shell (Step 2), and the JS (Step 3); the `../vendor/bulma.min.css` import path matches the file created in Task 1.
- **Note (non-blocking):** sticky `thead` inside Bulma's `.table-container` (which becomes a scroll context) may stick within the container rather than the viewport; harmless for the small dataset — Step 5 verifies it does no damage either way.
